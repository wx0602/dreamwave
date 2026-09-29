module.exports = {
  // 本地体验使用 local；部署/真机体验改为 cloud。
  transport: "cloud",
  localBaseUrl: "http://127.0.0.1:3001",
  // 微信云开发环境 ID，例如 cloud1-xxxx。留空时调用当前默认环境。
  env: "cloud1-d2gh7wkxx37588619",
  // 微信云托管服务名，不是公网域名。
  service: "aigc-backend",
};
