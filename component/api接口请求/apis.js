import axios from 'axios';
import qs from 'qs';
import interfaceUrl from './urls';
import ViewUI from 'view-design';
import lodash from '../lib/methods';
import {getToken,setToken} from '@/lib/utils';
import VueCookie from 'vue-cookie';
//import store from '@/store/index';
const BASE_URL = process.env.VUE_APP_API_PATH;
// 加载中组件
let LoadTip = {
  msg: null,
  open() {
    ViewUI.LoadingBar.start();
  },
  close() {
    ViewUI.LoadingBar.finish();
  },
  error() {
    ViewUI.LoadingBar.error();
  }
};

let apis = {};
// 配置axios实例
function axiosIns(){
  let tokenStr = getToken();
  
  
  let axiosI = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      Authorization: tokenStr ? ('Bearer ' + tokenStr) : '',
    },
    withCredentials: true, // default
    transformRequest: function(data) {
      return data;
    },
    validateStatus: function(status) {
      return status >= 200 && status < 300;
    }
  });
  axiosI.interceptors.request.use(
    function(config) {
      // 处理url传参方式
      const params = config.params || qs.parse(config.data) || {};
      config.url = config.url.replace(/\{\w+\}/gi, pname => {
        const paramsName = pname.replace(/\{?\}?/gi, '');
        const presult = params[paramsName];
        delete params[paramsName];
        return presult;
      });

      delete params.methodName;

      LoadTip.open();
      return config;
    },
    function(err) {
      return Promise.reject(err);
    }
  );
  // Response Interceptor
  axiosI.interceptors.response.use(
    function(response) {
      LoadTip.close();
      //更新登录标识及token 失效时间
      if(VueCookie.get('islogin_scs')){
        VueCookie.set('islogin_scs',VueCookie.get('islogin_scs'),{ expires: '30m' });
        VueCookie.set('account_scs',VueCookie.get('account_scs'),{ expires: '30m' });
        setToken(getToken());
      }
      return response;
    },
    function(error) {
      return Promise.reject(error);
    }
  );
  return axiosI;
}

// 遍历api.url配置实例
for (let i in interfaceUrl) {
  let parmas = interfaceUrl[i].split(','),
    url = parmas[1],
    method = parmas[0] ? parmas[0].toUpperCase() : 'GET',
    curInstance;

  apis[i] = (parmas, hooks) => {
    parmas = parmas || {};
    const method_ = method.toLowerCase();
    const hooks_ = hooks || {};
    const noAlertError_ = parmas.noAlertError;
    // before 钩子
    if (hooks_.before) {
      hooks_.before();
    }
    let lang = localStorage.getItem('locale_scs') || 'zh_CN';
    const ainstance = axiosIns();
    //const channelId = store.getters.channelId;
    if (method === 'POST' || method === 'PUT') {
      const urlP  = url + '?lang=' + lang.replace('-','_');// + (channelId?('&channelId='+channelId):'');
      curInstance = ainstance[method_](urlP, JSON.stringify(parmas));
    } else if (method == 'PATCH') {
      const urlP = url + '?lang=' + lang.replace('-','_');// + (channelId?('&channelId='+channelId):'');
      curInstance = ainstance[method_](urlP, qs.stringify(parmas));
    } else {
      curInstance = ainstance[method_](url, {
        params: Object.assign(parmas,{lang:lang.replace('-','_')})
      });
    }

    return curInstance
      .then(response => {
        const responseData = response.data;
        LoadTip.close();
        hooks_.done && hooks_.done(responseData); //  存在done钩子

        const {code,message} = responseData;
        if (code == 200) {
          // ViewUI.Message.success('请求成功');
        }
        // 401 前往登录
        if (code == 401 || code == 403) {
          //提示并清除登录cookie
          ViewUI.Message.error(message);
          VueCookie.delete('account_scs');
          VueCookie.delete('islogin_scs');
          VueCookie.delete('token_scs');
          location.href = '#/login';
        }

        return responseData;
      })
      .catch(error => {
        const response = error.response;
        const {status,data} = response;
        // 401 前往登录
        if (status == 401 || status == 403) {
          //提示并清除登录cookie
          ViewUI.Message.error(data.message);
          VueCookie.delete('account_scs');
          VueCookie.delete('islogin_scs');
          VueCookie.delete('token_scs');
          location.href = '#/login';
          return;
        }
        // 不存在response, 接口有误
        if (!response) {
          ViewUI.Message.error('接口有误');
          return Promise.reject(error);
        }

        const responseData = response.data;

        LoadTip.error();
        hooks_.done && hooks_.done(responseData);

        !noAlertError_ && layerErrorMsg(error);
        return Promise.reject(response);
      });
  };
}

function layerErrorMsg(error) {
  const response = error.response;
  const isValidError = response.status === 422; // 验证错误
  const responseData = response.data;
  let errorMsg = '';
  if (isValidError) {
    const errors = responseData.errors;
    const errorAr = lodash.map(errors, errorAr => {
      return errorAr.join(',');
    });
    errorMsg = errorAr.join('<br/>');
  } else {
    errorMsg = responseData.message;
  }
  ViewUI.Message.error(errorMsg);
}

function install(Vue) {
  if (install.installed) {
    return;
  }
  install.installed = true;

  Object.defineProperty(Vue.prototype, '$apis', {
    get: function get() {
      return apis;
    }
  });
  Object.defineProperty(Vue.prototype, '$axios', {
    get: function get() {
      return axiosIns();
    }
  });
}

let inBrowser = typeof window !== 'undefined';
apis.install = install;

if (inBrowser && window.Vue) {
  window.Vue.use(apis);
}

export default apis;
