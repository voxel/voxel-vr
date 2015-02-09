'use strict';

require('webvr-polyfill'); // fills navigator.getVRDevices(), etc.
var mat4 = require('gl-mat4');
var shallow_copy = require('shallow-copy');

module.exports = function(game, opts) {
  return new VRPlugin(game, opts);
};
module.exports.pluginInfo = {
  loadAfter: ['game-shell-fps-camera', 'voxel-shader', 'voxel-fullscreen']
};

function VRPlugin(game, opts) {
  this.game = game;
  this.camera = game.plugins.get('game-shell-fps-camera');
  if (!this.camera) throw new Error('voxel-vr requires game-shell-fps-camera plugin'); // TODO: other cameras
  this.shader = game.plugins.get('voxel-shader');
  if (!this.shader) throw new Error('voxel-vr requires voxel-shader plugin');
  this.fullscreen = game.plugins.get('voxel-fullscreen'); // optional

  this.hmdvrDevice = undefined;
  this.currentEye = undefined;

  this.projectionMatrixLeft = mat4.create();
  this.projectionMatrixRight = mat4.create();

  // defaults if no VR device
  this.translateLeft = [-0.05, 0, 0];
  this.translateRight = [+0.05, 0, 0];
  this.FOVsLeft = {
    upDegrees: 45,
    downDegrees: 45,
    leftDegrees: 45,
    rightDegrees: 45
  };
  this.FOVsRight = {
    upDegrees: 45,
    downDegrees: 45,
    leftDegrees: 45,
    rightDegrees: 45
  };

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

  this.oldUpdateProjectionMatrix = this.shader.listeners('updateProjectionMatrix');
  this.shader.removeAllListeners('updateProjectionMatrix');
  this.shader.on('updateProjectionMatrix', this.onPerspective = this.perspectiveVR.bind(this));

  if (this.fullscreen) {
    if (this.requestFlags)  {
      this.oldRequestFlags = this.fullscreen.requestFlags;
      this.fullscreen.requestFlags = this.requestFlags;
    }
  }

  this.scanDevices();
};

VRPlugin.prototype.disable = function() {
  this.game.shell.removeAllListeners('render');
  for (var i = 0; i < this.oldRenders.length; i += 1) {
    this.game.shell.on('render', this.oldRenders[i]);
  }

  this.shader.removeAllListeners('updateProjectionMatrix');
  for (var i = 0; i < this.oldUpdateProjectionMatrix.length; i += 1) {
    this.shader.on('updateProjectionMatrix', this.oldUpdateProjectionMatrix[i]);
  }

  if (this.fullscreen) {
    if (this.oldRequestFlags) {
      // no longer fullscreen to the VR device
      this.fullscreen.requestFlags = this.oldRequestFlags;
    }
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
        // translation vector per eye
        self.translateLeft = xyz2v(device.getEyeTranslation('left'));
        self.translateRight = xyz2v(device.getEyeTranslation('right'));

        // field of views per eye
        // Note: using shallow_copy since left and right might be same object (webvr-polyfill bug?)
        // but we want to allow adjusting them individually
        self.FOVsLeft = shallow_copy(device.getRecommendedEyeFieldOfView('left'));
        self.FOVsRight = shallow_copy(device.getRecommendedEyeFieldOfView('right'));
        // TODO: .getMaximumEyeFieldOfView

        self.shader.updateProjectionMatrix(); // -> perspectiveVR

        // voxel-fullscreen to the VR device
        if (self.fullscreen
          //&& device.hardwareUnitId !== 'polyfill' // hack to exclude non-real (virtual?) devices, so original flags are preserved
          ) {
            self.requestFlags = { vrDisplay: device };
            self.oldRequestFlags = self.fullscreen.requestFlags;
            self.fullscreen.requestFlags = self.requestFlags;
        }
        self.hmdvrDevice = device;

        break; // use only first HMD device found TODO: configurable multiple devices
      }
    }
  }, function(err) {
    console.log('voxel-vr error in getVRDevices: ',err);
  });
};

// Compute the projection matrix, when the viewport changes
VRPlugin.prototype.perspectiveVR = function(out) {
  // Save the matrix for each eye, locally
  mat4.perspectiveFromFieldOfView(this.projectionMatrixLeft, this.FOVsLeft, this.shader.cameraNear, this.shader.cameraFar);
  mat4.perspectiveFromFieldOfView(this.projectionMatrixRight, this.FOVsRight, this.shader.cameraNear, this.shader.cameraFar);
  // out sets voxel-shader .projectionMatrix, but we have to (re)set it individually for each eye in renderVR below
};

// Compute the view matrix, each frame
VRPlugin.prototype.viewVR = function(out) {
  var eye = this.currentEye;

  if (eye === 0) {
    mat4.translate(out, out, this.translateLeft);
  } else {
    mat4.translate(out, out, this.translateRight);
  }
};

// Render scene twice, once for each eye (replaces gl-now renderGLNow(t))
VRPlugin.prototype.renderVR = function(t) {
  var shell = this.game.shell;
  var scale = this.game.shell.scale;
  var gl = shell.gl;

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
  mat4.copy(this.shader.projectionMatrix, this.projectionMatrixLeft);
  shell.emit("gl-render", t)


  // Right eye
  this.currentEye = 1
  gl.viewport((shell._width / scale / 2)|0, 0, (shell._width / scale / 2)|0, (shell._height / scale)|0)
  mat4.copy(this.shader.projectionMatrix, this.projectionMatrixRight);
  shell.emit("gl-render", t)

  this.currentEye = undefined
};
