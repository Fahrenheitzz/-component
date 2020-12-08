<template>
  <div class="file-upload">
    <input
      accept="jimage/pg,image/jpeg,image/png"
      type="file"
      class="file-upload-input"
      ref="fileInput"
      @change="change"
    />
    <slot></slot>
  </div>
</template>
<script>
export default {
  name: 'FileUpload',
  data() {
    return {};
  },
  methods: {
    getObjectURL(file) {
      let url = null;
      if (window.createObjectURL != undefined) {
        // basic
        url = window.createObjectURL(file);
      } else if (window.URL != undefined) {
        // mozilla(firefox)
        url = window.URL.createObjectURL(file);
      } else if (window.webkitURL != undefined) {
        // webkit or chrome
        url = window.webkitURL.createObjectURL(file);
      }
      return url;
    },
    change(event) {
      let files = event.target.files;
      this.$lodash.forEach(files, (file) => {
        this.uploadFile(file);
      });
    },
    uploadFile(file) {
      const fileType = file.name.split('.').pop();
      if(['jpg','jpeg','png'].indexOf(fileType.toLowerCase())<0){
        this.$Message.success('文件类型非jpg,jpeg,png');
        return false;
      }
      const { type } = file;
      let obj = {
        url: '',
        type,
        binary: null,
        key: '',
      };
      this.getUploadUrl(type)
        .then(({ key, uploadUrl }) => {
          obj.key = key;
          obj.url = uploadUrl;
          return this.getFileBinary(file);
        })
        .then((binary) => {
          obj.binary = binary;
          return this.putFileBinary(obj);
        })
        .then((status) => {
          if (status == 200) {
            const url = this.getObjectURL(file);
            const key = obj.key;
            const name = file.name;
            this.$emit('uploaded', { url, key, name});
            this.$refs['fileInput'].value = '';
            this.$Message.success('上传成功');
          }
        });
    },
    getUploadUrl(contentType) {
      return new Promise((resolve, reject) => {
        this.$axios.get(`${process.env.VUE_APP_FUCS_ORIGIN}${process.env.VUE_APP_FUCS_API}?contentType=${contentType}`).then(res => {
          const data = res.data;
          if (data && data.code == 200 && data.data) {
            resolve(data.data);
          } else if (res.message) {
            reject(data.message);
          }
        });
      });
    },
    getFileBinary(file) {
      return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = () => {
          resolve(reader.result);
        };
        reader.onerror = () => {
          reject(reader.error);
          reader.abort();
        };
      });
    },
    putFileBinary({ url, binary, type }) {
      return new Promise((resolve, reject) => {
        let xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', type);
        if (xhr.sendAsBinary) {
          xhr.sendAsBinary(binary);
        } else {
          xhr.send(binary);
        }
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            if (xhr.status === 200) {
              resolve(xhr.status);
            } else {
              reject(new Error('Failed'));
            }
          }
        };
      });
    },
  },
};
</script>
<style lang="less" scoped>
.file-upload {
  display: inline-block;
  position: relative;
  .file-upload-input {
    opacity: 0;
    width: 100%;
    cursor: pointer;
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
  }
}
</style>
