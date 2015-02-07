'use strict';

require('webvr-polyfill'); // fills navigator.getVRDevices(), etc.
var glm = require('gl-matrix');
var mat4 = glm.mat4;

module.exports = function(game, opts) {
  return new VRPlugin(game, opts);
};
module.exports.pluginInfo = {
  loadAfter: ['game-shell-fps-camera'] // TODO: other cameras?
};

function VRPlugin(game, opts) {
  this.game = game;
  this.camera = game.plugins.get('game-shell-fps-camera');
  this.currentEye = undefined;

  // defaults if no VR device
  this.translateLeft = [-0.05, 0, 0];
  this.translateRight = [+0.05, 0, 0];

  this.enable();
}

VRPlugin.prototype.enable = function() {
  // Replace renderer with our own stereoscopic version TODO: only replace renderGLNow?
  // TODO: replace in this.game.shell.on('init', ...), which is where gl-now adds its render;
  //  otherwise, this plugin cannot be enabled at startup
  this.oldRenders = this.game.shell.listeners('render');
  this.game.shell.removeAllListeners('render');
  this.game.shell.on('render', this.renderVR.bind(this));
  this.camera.on('view', this.onView = this.viewVR.bind(this));
  this.scanDevices()
};

VRPlugin.prototype.disable = function() {
  this.game.shell.removeAllListeners('render');

  for (var i = 0; i < this.oldRenders.length; i += 1) {
    this.game.shell.on('render', this.oldRenders[i]);
  }
};

var xyz2v = function(xyz) {
  return [xyz.x, xyz.y, xyz.z]
};

VRPlugin.prototype.scanDevices = function() {
  if (!('getVRDevices' in navigator)) return; // should be polyfilled by webvr-polyfill, but just in case

  var self = this;

  navigator.getVRDevices().then(function(devices) {
    for (var i = 0; i < devices.length; i += 1) {
      var device = devices[i];

      if (device instanceof HMDVRDevice) {
        self.translateLeft = xyz2v(device.getEyeTranslation('left'));
        self.translateRight = xyz2v(device.getEyeTranslation('right'));

        // TODO: .getRecommendedEyeFieldOfView

        break; // use only first HMD device found TODO: configurable multiple devices
      }
    }
  }, function(err) {
    console.log('voxel-vr error in getVRDevices: ',err);
  });
};

VRPlugin.prototype.viewVR = function(out) {
  var eye = this.currentEye;

  if (eye === 0) {
    mat4.translate(out, out, this.translateLeft);
  } else {
    mat4.translate(out, out, this.translateRight);
  }

  // TODO: use new 'VR-oriented' mat4.perspectiveFromFieldOfView
  //  in https://github.com/toji/gl-matrix/commit/955bb55a48e4a484304cc487638f4ef18d60cd00
};

VRPlugin.prototype.renderVR = function(t) {
  var shell = this.game.shell;
  var scale = this.game.shell.scale;
  var gl = shell.gl;

  // render scene twice, once for each eye
  // replaces gl-now renderGLNow(t)

  //Bind default framebuffer
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  //Clear buffers
  if(shell.clearFlags & gl.STENCIL_BUFFER_BIT) {
    gl.clearStencil(shell.clearStencil)
  }
  if(shell.clearFlags & gl.COLOR_BUFFER_BIT) {
    gl.clearColor(shell.clearColor[0], shell.clearColor[1], shell.clearColor[2], shell.clearColor[3])
  }
  if(shell.clearFlags & gl.DEPTH_BUFFER_BIT) {
    gl.clearDepth(shell.clearDepth)
  }
  if(shell.clearFlags) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
  }

  // Left eye
  this.currentEye = 0
  gl.viewport(0, 0, (shell._width / scale / 2)|0, (shell._height / scale)|0)
  shell.emit("gl-render", t)

  // Right eye
  this.currentEye = 1
  gl.viewport((shell._width / scale / 2)|0, 0, (shell._width / scale / 2)|0, (shell._height / scale)|0)
  shell.emit("gl-render", t)

  this.currentEye = undefined
};
