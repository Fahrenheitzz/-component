<template>
  <div>
    <!-- 普通按钮上传 -->
    <div v-show="!showIcon">
        <Upload ref="uploadFile" accept=".xlsx" v-show="!loading" :headers="headers" :action="text==$t('browse') ? uploadVehicleUrl:uploadUrl" :before-upload="beforeupload" :on-progress="onprogress" :max-size="maxSize" :on-exceeded-size="exceededsize" :on-success="imageuploaded" :on-error="onerror" :show-upload-list="false">
        <Button type="primary" :icon="uploadIcon">{{ text }}</Button>
      </Upload>
      <!-- <Button type="primary" shape="circle" v-show="loading" :loading="loading">{{$t('upload_file_ing')}}...</Button> -->
    </div>
    <!-- 图片上传+预览 -->
    <div v-show="showIcon" class="upload-content">
      <Upload type="drag" v-show="!imageShow" :headers="headers" :action="uploadUrl" :before-upload="beforeupload" :on-progress="onprogress" :on-exceeded-size="exceededsize" :max-size="maxSize" :on-success="imageuploaded" :on-error="onerror" :show-upload-list="false">
        <div>
          <div style="padding: 20px 0">
            <Icon type="ios-cloud-upload-outline" size="52"></Icon>
            <p class="tip">{{$t('image_max_2m')}}</p>
            <p style="color: #2770C5">{{$t('click_upload')}}</p>
          </div>
        </div>
      </Upload>
      <img class="image" v-show="imageShow" :src="imgUrl" @click="imageShow = false;">
    </div>

    <!-- 进度条弹窗 -->
    <Modal v-model="loading" :title="$t('upload_file')" :mask-closable="false" width="580">
      <div class="progress-container">
        <div class="progress-title">
          <span class="percent">{{file.percentage + '%'}}</span>
          <span class="speed">{{speed + 'kb/s'}}</span>
        </div>
        <Progress :percent="file.percentage">
          <span v-if="file.percentage === 100" class="ivu-progress-text-inner">100%</span>
          <img v-else class="turn" :src="flowerpng">
        </Progress>
      </div>
      <div slot="footer">
        <Button type="primary" @click="cancleUpload()" style="margin: 6px 10px">{{$t('btn_cancle')}}</Button>
      </div>
    </Modal>
  </div>
</template>
<script>
import flowerpng from '@/assets/flower.png';
import { getToken } from '@/lib/utils';
import { getI18nVal } from '@/language/i18n';

const API_PATH = process.env.VUE_APP_API_PATH;
let uploadUrl = `${API_PATH}/ota/upload/uploadFile`;
let uploadVehicleUrl = `${API_PATH}/ota/otaVehicleUpgradeInfo/uploadVehicleExcel`;

export default {
  props: {
    maxSize: {
      type: Number,
      default: 20971520, // KB
    },
    text: {
      type: [String, Number],
      default: getI18nVal('upload_file')
    },
    showIcon: {
      type: Boolean,
      default: true
    },
    groupIndex: {
      type: Number,
      default: -1
    },
  },
  data() {
    return {
      // modal_progess: true,
      flowerpng: flowerpng,
      imageShow: false,
      imgUrl: '',
      loading: false,
      uploadIcon: this.showIcon ? 'ios-cloud-upload-outline' : '',
      uploadUrl,
      uploadVehicleUrl,
      speed: '0',
      file:{
        percentage: 0
      },
      headers: {}
    };
  },
  watch: {},
  mounted () {
    const token = getToken();
    if(token){
      this.headers['Authorization'] = `Bearer ${token}`;
    }
  },
  methods: {
    cancleUpload(){
      this.loading = false;
      this.$refs.uploadFile.clearFiles();
    },
    beforeupload(file) {
      let isAvalidFileName = this.$lodash.isAvalidFileName(file.name);
      if (!isAvalidFileName) {
        this.$Message.warning(this.$t('upload_file_tip_1'));
      }
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const _base64 = reader.result;
        this.imgUrl = _base64; //将_base64赋值给图片的src，实现图片预览
      };
      return isAvalidFileName;
    },
    // eslint-disable-next-line
    onprogress(event, file, fileList) {
      this.imageShow = true;
      // 调用监听 上传进度 的事件
      this.loading = true;
      event.target.onprogress = (event) => {
        let uploadPercent = parseFloat(((event.loaded / event.total) * 100).toFixed(0));	// 保留整數位
        // 手动设置显示上传进度条 以及上传百分比 实时浏览器网速
        this.speed = navigator.connection.downlink * 1024 / 8; //单位为KB/sec

        file.showProgress = true;
        file.percentage = uploadPercent;
        this.file = file;
      };
    },
    // eslint-disable-next-line
    onerror(error, file, fileList) {
      this.file.showProgress = false;
      this.imageShow = false;
      this.loading = false;
      this.$Message.warning(
        error.message || this.$t('upload_file_tip_f') + '!'
      );
    },
    // eslint-disable-next-line
    exceededsize(file, fileList) {
      this.$Message.warning(
        this.$t('upload_file_tip_2') +
          this.maxSize / 1024 +
          this.$t('upload_file_tip_3')
      );
    },
    imageuploaded(response, file, fileList) {
      this.loading = false;
      if (response.code == 200) {
        this.$emit('uploaded', response, file, fileList,this.groupIndex);
      } else {
        this.$Message.warning(
          response.message || this.$t('upload_file_tip_f') + '!'
        );
      }
    }
  }
};
</script>
<style lang="less" scoped>
.upload-content{
  margin-top: 40px;
  /deep/.ivu-upload-drag{
    border: 1px solid #dcdee2;
    // width: 5rem;
    // height: 2.5rem;
  }
  .image{
      display: inline-block;
      object-fit: cover;
      width: 5rem;
      height: 2.5rem;
      vertical-align: middle;
    }
  .tip{
    color: #6c6c6c;
    font-size: 12px;
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
