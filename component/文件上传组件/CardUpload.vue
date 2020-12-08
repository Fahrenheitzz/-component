<template>
  <div class="up-img">
    <div class="upload">
      <input type="file" accept="application/zip,application/x-rar-compressed" class="upload-input" ref="fileInput"  name="fileContent" @change="startUpload()">
      <Button type="primary" class="upload-btn">点击上传</Button>
    </div>
    <!-- 进度条弹窗 -->
    <Modal v-model="loading" :title="$t('upload_file')" :mask-closable="false" width="580" :footer-hide="true" @on-cancel="cancel">
      <div class="progress-container">
        <div class="progress-title">
          <span class="percent">{{percentage + '%'}}</span>
          <span class="speed">{{speed + 'kb/s'}}</span>
        </div>
        <Progress :percent="percentage">
          <span v-if="percentage === 100" class="ivu-progress-text-inner">100%</span>
          <img v-else class="turn" :src="flowerpng">
        </Progress>
      </div>
    </Modal>
  </div>
</template>
<script>
const hash = require('hash.js');
// import sha256 from 'crypto-js/sha256';
import CryptoJs from 'crypto-js';
import encHex from 'crypto-js/enc-hex';
import flowerpng from '@/assets/flower.png';
import {uploadPath} from '@/lib/enum';
const VUE_APP_PART_UPLOAD_SWITCH = process.env.VUE_APP_PART_UPLOAD_SWITCH;
const VUE_APP_FUCS_ORIGIN = process.env.VUE_APP_FUCS_ORIGIN;
export default {
  name: 'CardUpload',
  props:{
    value: {
      type:Array,
      default: ()=>{return [];}
    }
  },
  data(){
    return {
      flowerpng: flowerpng,
      startData: null,//开始上传返回参数
      returnList: [],//每片上传成功返回数据数组
      loading: false,
      percentage: 0,
      speed: 0,
      currSendType: null,
      totalLoad: {},
      failNum: 0,
      startTime: null,
      hasCancel: false,//有内鬼，终止交易
      fileHash: null,
    };
  },
  methods: {
    cancel(){
      this.hasCancel = true;
      if(this.startData){
        this.$refs.fileInput.value = null;
        const {bucket,fileKey,uploadId} = this.startData;
        const abortData = {
          bucket,
          fileKey,
          uploadId
        };
        this.$axiosFus.post(`${VUE_APP_FUCS_ORIGIN}${uploadPath[VUE_APP_PART_UPLOAD_SWITCH].abortPartUpload}`,JSON.stringify(abortData)).then(()=>{return;});
      }
    },
    startUpload(){
      this.percentage = 0;
      this.speed = 0;
      this.totalLoad = {};
      this.failNum = 0;
      this.hasCancel = false;
      this.returnList = [];
      this.fileHash = null;
      let file = this.$refs.fileInput.files[0];
      const fileType = {zip:'application/x-zip-compressed',rar:'application/octet-stream'};
      if(file){
        //this.getHashChunk(file).then((res)=>{console.log(res);});
        this.loading = true;
        const _suffix = file.name.substr(file.name.lastIndexOf('.')+1);
        if(!fileType[_suffix.toLocaleLowerCase()]){
          this.$Message.warning('上传文件格式为zip、rar');
          return false;
        }
        const sendType = file.type || fileType[_suffix];
        this.currSendType = sendType;
        let startForm = new FormData();
        startForm.append('contentType', sendType);
        startForm.append('fileName', file.name);
        this.$axiosFus.post(`${VUE_APP_FUCS_ORIGIN}${uploadPath[VUE_APP_PART_UPLOAD_SWITCH].startPartUpload}`,startForm).then(res => {
          const data = res.data;
          if (data && data.code == 200 && data.data) {
            //获取开始上传参数
            this.startData = data.data;
            this.sendAws();
          }else{
            this.$Message.error(data.message);
          }
        });
      }
    },
    //开始上传
    sendAws(){
      //获取本地文件
      let file = this.$refs.fileInput.files[0];
      let alog =  CryptoJs.algo.SHA256.create();
      let bolbSlice = File.prototype.mozSlice || File.prototype.webkitSlice || File.prototype.slice;
      let promise = Promise.resolve();
      const partSize = this.startData.partSize || 1025*1024*5;//
      const {size} = file;
      //计算分片数
      let cardNum = Math.ceil(size/partSize);
      //当最后一片小于 5M  分片数减一
      if(cardNum > 1 && (size - partSize * (cardNum - 1)) < 10240){
        cardNum = cardNum - 1;
      }
      //设置分片文件及序号
      let chunks = [];
      for (let i = 0; i < cardNum; i++) {
        let chunk = null;
        if(i === (cardNum -1)){//最后一片直接到末尾
          chunk = bolbSlice.call(file,partSize*i , size);
        }else{
          chunk = bolbSlice.call(file,partSize*i , partSize*(i+1));
        }
        chunks[i] = {order: i+1,chunk};
        promise = promise.then(() => this.hashBlob(chunk,alog));
      }
      promise.then(() => {this.fileHash = encHex.stringify(alog.finalize());});
      this.startTime = new Date().getTime();
      this.uploadFile(chunks,1,cardNum,[],size);
    },
    /**
     * chunks：分片文件数组
     */
    uploadFile(chunks,startIndex=1,size,failList=[],fileSize) {
      //取消上传
      if(this.hasCancel){return;}
      //获取此次递归分片序号
      const indexList = this.getCurrIndexList(size,startIndex,failList);
      if(this.failNum > this.startData.retryNum){
        this.$Message.warning('当前网络不稳地，请重新上传！');
        this.cancel();
      }
      //无上传分片结束
      if(indexList.length<1){
        console.log('上传持续时间（ms）：' + ((new Date().getTime()) - this.startTime));
        const file = this.$refs.fileInput.files[0];
        // this.getHash(file,(hashVal)=>{
        this.$refs.fileInput.value = null;
        const {bucket,fileKey,uploadId} = this.startData;
        const endData = {
          partTagsVoList:this.returnList,
          bucket,
          fileKey,
          uploadId
        };
        this.$axiosFus.post(`${VUE_APP_FUCS_ORIGIN}${uploadPath[VUE_APP_PART_UPLOAD_SWITCH].completePartUpload}`,JSON.stringify(endData)).then(res=>{
          const data = res.data;
          if (data && data.code == 200 && data.data){
            this.percentage = 100;
            const {fileKey, fileLength} = data.data;
            const response = {fileKey,fileSha:this.fileHash,fileLength};
            this.$emit('uploaded', response, file);
            this.loading = false;
            //this.$Message.success('上传成功');
          }else{
            this.$Message.error(data.message);
          }
        });
        //});
        return;
      }
      //并发请求
      let reqList = [];
      for (let j = 0; j < indexList.length; j++) {
        let upForm = new FormData();
        const currCard = chunks[indexList[j]-1];
        upForm.append('file', currCard.chunk);
        upForm.append('bucket', this.startData.bucket);
        upForm.append('curPartSize', currCard.chunk.size);
        upForm.append('encryptMethod', this.startData.encryptMenthod);
        upForm.append('encryptedKey', this.startData.encryptedKey);
        upForm.append('fileKey', this.startData.fileKey);
        upForm.append('iv', this.startData.iv);
        upForm.append('kmsCode', this.startData.kmsCode);
        upForm.append('partNum', currCard.order);
        upForm.append('plainKey', this.startData.plainKey);
        upForm.append('uploadId', this.startData.uploadId);
        // reqList.push(new Promise(()=>{
        //   let xhr = new XMLHttpRequest();
        //   xhr.open('post', '/fus/oss/part/ota/uploadPartAndEncrypt');
        //   //xhr.setRequestHeader('Content-Type', 'multipart/form-data');
        //   xhr.send(upForm);
        //   xhr.upload.onprogress = (progressEvent) => {
        //     console.log(progressEvent);
        //   };
        // }));
        //reqList.push(this.$axiosFus.post('/fus/oss/part/ota/uploadPartAndEncrypt',upForm));
        reqList.push(this.$axiosFus({
          url: `${VUE_APP_FUCS_ORIGIN}${uploadPath[VUE_APP_PART_UPLOAD_SWITCH].partUploadAndEncrypt}`,
          method: 'post',
          data: upForm,
          timeout: 120000,
          retry: this.startData.retryNum, //重连次数
          retryDelay: 120000,//重连间隔
          onUploadProgress: (progressEvent) => {
            const {loaded,timeStamp,total} = progressEvent;
            this.speed = Math.ceil(Number(loaded)/1024/(Number(timeStamp)/1000));
            //每片占总片百分比
            const oneCard = 1/size;
            let currPercent = 0;
            this.totalLoad[currCard.order] = Math.floor(((Number(loaded)/Number(total)*oneCard))*100);//当前分片已上传
            for (const key in this.totalLoad) {
              if (this.totalLoad.hasOwnProperty(key)) {
                const element = this.totalLoad[key];
                currPercent = currPercent + element;
              }
            }
            this.percentage = currPercent>100?99:currPercent;
            //console.log(this.totalLoad,progressEvent,fileSize,this.speed,this.percentage)
          }
        }));
      }
      //正式上传
      let curFailList = [];
      Promise.all(reqList).then((_list) => {
        for (let index = 0; index < _list.length; index++) {
          const element = _list[index].data; 
          if(element && element.code == 200 && element.data && element.data.resultCode === 200){
            const data = element.data;
            this.returnList.push(data);
          }else{
            //收集失败分片累加失败次数
            this.failNum++;
            curFailList.push(element.data.partNumber);
          }
        }
        //更新开始位置
        let start = Math.max(...indexList) + 1;
        this.uploadFile(chunks,start,size,curFailList,fileSize);
      }).catch((error)=>{this.$Message.error(error);});
    },
    /**
     * 获取当前并发组分片序号
     */
    getCurrIndexList(size,startIndex,failList=[]){
      const groupNum = this.startData.groupNum || 3;
      const realCount = groupNum - failList.length;//实际需要新加个数
      //并发组数，3个一组
      if(((size-startIndex)/realCount)>=1){
        let list = [];
        for (let index = 0; index < realCount; index++) {
          list.push(startIndex+index);
        }
        return list.concat(failList);
      }else{
        let list = [];
        for (let index = 0; index <= (size-startIndex)%realCount; index++) {
          list.push(startIndex+index);
        }
        return list.concat(failList);
      }
    },
    getHash(chunk,cb){
      var reader = new FileReader();
      console.log(chunk);
      reader.readAsArrayBuffer(chunk);
      reader.onload =  (result) => {
        console.log(result);
        if (typeof cb === 'function') {
          const res = hash.sha256().update(result.target.result).digest('hex');
          console.log(res);
          cb.call(this, res);
        }
      };
    },
    getHashChunk(file){
      let alog =  CryptoJs.algo.SHA256.create();
      let bolbSlice = File.prototype.mozSlice || File.prototype.webkitSlice || File.prototype.slice;
      const partSize = 1025*1024*5;//
      const {size} = file;
      //计算分片数
      let cardNum = Math.ceil(size/partSize);
      //当最后一片小于 5k  分片数减一
      if((size - partSize * (cardNum - 1)) < 10240){
        cardNum = cardNum - 1;
      }
      let promise = Promise.resolve();
      //设置分片文件及序号
      let chunks = [];
      for (let i = 0; i < cardNum; i++) {
        let chunk = null;
        if(i === (cardNum -1)){//最后一片直接到末尾
          chunk = bolbSlice.call(file,partSize*i , size);
        }else{
          chunk = bolbSlice.call(file,partSize*i , partSize*(i+1));
        }
        chunks[i] = {order: i+1,chunk};
        promise = promise.then(() => this.hashBlob(chunk,alog));
      }
      return promise.then(() => encHex.stringify(alog.finalize()));
    },
    /**
     * 更新文件块的hash值
     */
    hashBlob (blob,alog) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = ({ target }) => {
          const wordArray = CryptoJs.lib.WordArray.create(target.result);
          // 增量更新计算结果
          alog.update(wordArray);
          resolve();
        };
        reader.readAsArrayBuffer(blob);
      });
    },
    // 每片上传成功后执行(无并发函数)
    successPerUpload(resp, chunks,urlInfo) {
      this.$refs.fileInput.value = null;
      if (resp === 'OK') {
        this.$Message.success('上传成功');
        this.imgList.push({bannerUrl: this.getObjectURL(chunks),
          mainImg:this.imgList.length<1,
          ossKey:urlInfo.key});
      } else {
        //未上传完毕
        //query.offset = resp.offset;
        this.uploadFile(chunks, this.successPerUpload);
      }
    },

    // 获取文件二进制数据
    getFileBinary(file, cb) {
      var reader = new FileReader();
      reader.readAsArrayBuffer(file);
      reader.onload = function () {
        if (typeof cb === 'function') {
          cb.call(this, this.result);
        }
      };
    },
    getObjectURL (file) {
      let url = null ;
      if (window.createObjectURL!=undefined) { // basic
        url = window.createObjectURL(file) ;
      } else if (window.URL!=undefined) { // mozilla(firefox)
        url = window.URL.createObjectURL(file) ;
      } else if (window.webkitURL!=undefined) { // webkit or chrome
        url = window.webkitURL.createObjectURL(file) ;
      }
      return url ;
    },
  }
};
</script>
<style lang="less" scoped>
.up-img{
  position: relative;
  display: block;
  width: 100px;
  cursor: pointer;
  .upload{
    display: inline-block;
    width: 110px;
    background: #fff;
    //border: 1px dashed #dcdee2;
    border-radius: 4px;
    //text-align: center;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: border-color .2s ease;
    .upload-input{
      //display: none;

      cursor: pointer;
      width: 100px;
      height: 40px;
      opacity: 0;
      padding: 0;
      margin: 0;
    }
    .upload-btn{
      margin-top: -40px;
      display: block;
      width: 100px;
      height: 28px;
      line-height: 28px;
      border-radius: 4px;
    }
  }
  .ivu-icon-ios-camera:before {
    content: "\F160";
    box-sizing: border-box;
  }
}
.progress-container{
  margin: 10px 20px;
  .progress-title{
    margin: auto 10px;
    .percent{
      color: @theme-color;
      font-size: 18px;
    }
    .speed{
      float: right;
    }
  }
  /deep/.ivu-progress-show-info {
    .ivu-progress-text{
      border: 2px solid #fff;
      position: absolute;
      width: 35px;
      height: 35px;
      background-color: @theme-color ;
      top: 8px;
      right: 9px;
      border-radius: 50%;
      color: #fff;
      // background-image: url(../../assets/flower.png);
      .ivu-progress-text-inner{
        line-height: 30px;
      }

      .turn{
        animation:turn 2s linear infinite;
        width: 30px;
      }
      /*
        turn : 定义的动画名称
        1s : 动画时间
        linear : 动画以何种运行轨迹完成一个周期
        infinite :规定动画应该无限次播放
      */
      @keyframes turn{
        0%{-webkit-transform:rotate(0deg);}
        25%{-webkit-transform:rotate(90deg);}
        50%{-webkit-transform:rotate(180deg);}
        75%{-webkit-transform:rotate(270deg);}
        100%{-webkit-transform:rotate(360deg);}
      }
    }
    .ivu-progress-outer{
      padding-right: 0;
      margin-right: 0;
      height: 50px;
      box-shadow: 0px 0px 5px 0.4px rgba(230, 77, 20, 0.3);
      border-radius: 100px;
      .ivu-progress-inner{
        width: 96%;
        margin: 10px 10px;
        border-radius: 100px;
        .ivu-progress-bg{
          height: 30px !important;
          background-color: @theme-color;
        }
        .ivu-progress-success-bg{
          background-color: @theme-color;
        }
      }
    }
  }
}
</style>