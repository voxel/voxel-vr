# voxel-vr

WebVR voxel.js plugin

![screenshot](http://i.imgur.com/T0A5use.png "Screenshot")

Renders the scene side by side in stereo 3D for use with WebVR.
Requires [voxel-engine-stackgl](hndarra://github.com/deathcap/voxel-engine-stackgl),
and [game-shell-fps-camera](https://github.com/deathcap/game-shell-fps-camera),
load with [voxel-plugins](https://github.com/deathcap/voxel-plugins).

Replaces the `render` handler of [gl-now](https://github.com/stackgl/gl-now) to
emit `gl-render` twice per tick, one for each eye, with the viewport and matrices
set appropriately. If used on a WebVR-enabled browser (experimental Firefox or Chrome),
or on a platform supported by [webvr-polyfill](https://github.com/borismus/webvr-polyfill),
will attempt to use VR settings from a head-mounted VR device.

Warning: incomplete

## See also

* [MozVR](http://mozvr.com)
* [voxel-oculus](https://github.com/deathcap/voxel-oculus) - Oculus Rift stereo view for three.js-based voxel-engine, includes lens distortion
 (note this predates WebVR, with WebVR the browser is expected to perform the lens distortion instead)
* [voxel-oculus-vr](https://github.com/vladikoff/voxel-oculus-vr) - uses OculusRiftEffect.js from three.js
* [three.js example effects](https://github.com/mrdoob/three.js/tree/master/examples/js/effects) - OculusRiftEffect, StereoEffect, and VREffect (WebVR)


## License

MIT

