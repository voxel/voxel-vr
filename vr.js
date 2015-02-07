'use strict';

require('webvr-polyfill'); // fills navigator.getVRDevices(), etc.
var mat4 = require('gl-mat4');

module.exports = function(game, opts) {
  return new VRPlugin(game, opts);
};
module.exports.pluginInfo = {
  loadAfter: ['game-shell-fps-camera', 'voxel-shader']
};

function VRPlugin(game, opts) {
  this.game = game;
  this.camera = game.plugins.get('game-shell-fps-camera');
  if (!this.camera) throw new Error('voxel-vr requires game-shell-fps-camera plugin'); // TODO: other cameras
  this.shader = game.plugins.get('voxel-shader');
  if (!this.shader) throw new Error('voxel-vr requires voxel-shader plugin');
  this.currentEye = undefined;

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

  this.scanDevices()
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

        self.FOVsLeft = device.getRecommendedEyeFieldOfView('left');
        self.FOVsRight = device.getRecommendedEyeFieldOfView('right');
        // TODO: .getMaximumEyeFieldOfView

        break; // use only first HMD device found TODO: configurable multiple devices
      }
    }
  }, function(err) {
    console.log('voxel-vr error in getVRDevices: ',err);
  });
};

// TODO: use from mat4 https://github.com/stackgl/gl-mat4/pull/3
/**
 * Generates a perspective projection matrix with the given field of view.
 * This is primarily useful for generating projection matrices to be used
 * with the still experiemental WebVR API.
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} fov Object containing the following values: upDegrees, downDegrees, leftDegrees, rightDegrees
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
var perspectiveFromFieldOfView = function (out, fov, near, far) {
    var upTan = Math.tan(fov.upDegrees * Math.PI/180.0),
        downTan = Math.tan(fov.downDegrees * Math.PI/180.0),
        leftTan = Math.tan(fov.leftDegrees * Math.PI/180.0),
        rightTan = Math.tan(fov.rightDegrees * Math.PI/180.0),
        xScale = 2.0 / (leftTan + rightTan),
        yScale = 2.0 / (upTan + downTan);

    out[0] = xScale;
    out[1] = 0.0;
    out[2] = 0.0;
    out[3] = 0.0;
    out[4] = 0.0;
    out[5] = yScale;
    out[6] = 0.0;
    out[7] = 0.0;
    out[8] = -((leftTan - rightTan) * xScale * 0.5);
    out[9] = ((upTan - downTan) * yScale * 0.5);
    out[10] = far / (near - far);
    out[11] = -1.0;
    out[12] = 0.0;
    out[13] = 0.0;
    out[14] = (far * near) / (near - far);
    out[15] = 0.0;
    return out;
};

VRPlugin.prototype.perspectiveVR = function(out) {
  var fovs = (this.currentEye === 0 ? this.FOVsLeft : this.FOVsRight);

  // TODO: store per eye
  perspectiveFromFieldOfView(out, fovs, this.shader.cameraNear, this.shader.cameraFar);
};

VRPlugin.prototype.viewVR = function(out) {
  var eye = this.currentEye;

  if (eye === 0) {
    mat4.translate(out, out, this.translateLeft);
  } else {
    mat4.translate(out, out, this.translateRight);
  }

  // TODO: apply perspective here?? each frame, each eye
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

  // TODO: perspective projection retrieve per eye

  // Right eye
  this.currentEye = 1
  gl.viewport((shell._width / scale / 2)|0, 0, (shell._width / scale / 2)|0, (shell._height / scale)|0)
  shell.emit("gl-render", t)

  this.currentEye = undefined
};
