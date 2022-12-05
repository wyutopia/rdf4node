/**
 * Created by Eric on 16/4/2.
 */
 let express = require('express');

 // Get prototype of HttpResponse
 let responseWrapper = Object.getPrototypeOf(express.response);
 
 // Attach customized response methods
 responseWrapper.sendRsp = function(rc, msg, data) {
     let rsp = {
         code: rc,
         message: msg
     };
     if (data !== undefined && data !== null) {
         rsp.data = data;
     }
     this.send(rsp);
 };
 
 responseWrapper.sendSuccess = function(data) {
     this.sendRsp(200, 'SUCCESS', data);
 };
 
 responseWrapper.sendIntSrvErr = function() {
     this.sendRsp(500, 'Internal server error!');
 };
 
 module.exports = express;