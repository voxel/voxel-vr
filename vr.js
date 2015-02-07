'use strict';

module.exports = function(game, opts) {
  return new VRPlugin(game, opts);
};

function VRPlugin(game, opts) {
  this.game = game;

  this.enable();
}

VRPlugin.prototype.enable = function() {
  // Replace renderer with our own stereoscopic version TODO: only replace renderGLNow?
  // TODO: replace in this.game.shell.on('init', ...), which is where gl-now adds its render;
  //  otherwise, this plugin cannot be enabled at startup
  this.oldRenders = this.game.shell.listeners('render');
  this.game.shell.removeAllListeners('render');
  this.game.shell.on('render', this.renderVR.bind(this));
};

VRPlugin.prototype.disable = function() {
  this.game.shell.removeAllListeners('render');

  for (var i = 0; i < this.oldRenders.length; i += 1) {
    this.game.shell.on('render', this.oldRenders[i]);
  }
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

  //Set viewport for left eye
  gl.viewport(0, 0, (shell._width / scale / 2)|0, (shell._height / scale)|0)

  //Render frame
  shell.emit("gl-render", t)

  // TODO: transformation matrices, eye translation and fovs


  //Set viewport for right eye
  gl.viewport((shell._width / scale / 2)|0, 0, (shell._width / scale / 2)|0, (shell._height / scale)|0)

  //Render frame
  shell.emit("gl-render", t)
};
