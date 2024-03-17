local default_deps = 'npm yarn';
local default_windows_deps = 'zip nsis npm yarn';
local docker_image = 'registry.oxen.rocks/session-desktop-builder-unstable';

local apt_get_quiet = 'apt-get -o=Dpkg::Use-Pty=0 -q';

local upload_step(image='') = {
  name: 'Upload',
  [if image != '' then 'image']: image,
  commands: [
    'ls -l release',
    './build/drone-upload.sh',
  ],
  environment: { SSH_KEY: { from_secret: 'SSH_KEY' } },
};

local debian_pipeline(name,
                      image,
                      targets,
                      arch='amd64',
                      image=docker_image,
                      deps=default_deps,
                      upload=true,
                      allow_fail=false) = {
  kind: 'pipeline',
  type: 'docker',
  name: name,
  platform: { arch: arch },
  steps: [{
           name: 'Build',
           image: image,
           environment: {
             FORCE_COLOR: 'true',
             WINEDEBUG: '-all',
           },
           [if allow_fail then 'failure']: 'ignore',
           commands: [
             'echo "Building on ${DRONE_STAGE_MACHINE}"',
             'pwd',
             'ls -l',
             'ls -l ..',
             'ls -l ../..',
             'ls -l /session-deps',
             'ln -s /session-deps/node_modules .',
             'ls -l node_modules/libsession_util_nodejs',
             'ls -l node_modules/libsession_util_nodejs/build',
             'ls -l node_modules/libsession_util_nodejs/build/Release',
             // The yarn install below will wipe this out because it comes from a URL, but also
             // doesn't actually rebuild it (because of `--ignore-scripts).  This is a nuisance: the
             // build in the docker container should be fine (and if we *do* need to rebuild it, we
             // deal with that separately below), so save it then move it back into place:
             'mv node_modules/libsession_util_nodejs/build node_modules/libsession_util_nodejs/saved.build',
             'yarn install --frozen-lockfile --ignore-scripts',
             'mv node_modules/libsession_util_nodejs/saved.build node_modules/libsession_util_nodejs/build',
             'pwd',
             'ls -l',
             'ls -l ..',
             'ls -l ../..',
             'ls -l /session-deps',
             'ls -l node_modules/libsession_util_nodejs',
             'ls -l node_modules/libsession_util_nodejs/build',
             'ls -l node_modules/libsession_util_nodejs/build/Release',
             'libsess_base=$(cat /session-deps/package.json | jq -r \'.dependencies["libsession_util_nodejs"]\')',
             'libsess_curr=$(cat package.json | jq -r \'.dependencies["libsession_util_nodejs"]\')',
             'echo "LSNJS: ${libsess_base}/${libsess_curr}"',
             'pwd',
             'ls -l',
             'ls -l ..',
             'ls -l ../..',
             'ls -l /session-deps',
             'ls -l node_modules/libsession_util_nodejs',
             'ls -l node_modules/libsession_util_nodejs/build',
             'ls -l node_modules/libsession_util_nodejs/build/Release',
             'if [ "$libsess_base" != "$libsess_curr" ]; then (cd node_modules/libsession_util_nodejs && yarn install --frozen-lockfile); fi',
             'yarn patch-package',
             'eb_base=$(cat /session-deps/package.json | jq -r \'.devDependencies["electron-builder"]\')',
             'eb_curr=$(cat package.json | jq -r \'.devDependencies["electron-builder"]\')',
             'if [ "$eb_base" != "$eb_curr" ]; then yarn electron-builder install-app-deps; fi',
           ] + ['yarn ' + t for t in targets],
         }] +
         (if upload then [upload_step(image)] else []),
};


[
  debian_pipeline('Lint & Tests', docker_image, ['grunt', 'lint-full', 'test'], upload=false),
  debian_pipeline('Linux (amd64)', docker_image, ['build-release:linux']),
  //debian_pipeline('Windows (x64)', docker_image, ['win32']),
  //debian_pipeline('Linux (ARM64)', docker_image, ['deb'], arch='arm64'),

  /*
    {  // MacOS:
      kind: 'pipeline',
      type: 'exec',
      name: 'macOS (unsigned)',  // FIXME: figure out how to make signing work
      platform: { os: 'darwin', arch: 'amd64' },
      steps: [
        {
          name: 'Build',
          commands: [
            'echo "Building on ${DRONE_STAGE_MACHINE}"',
            './build/drone-build-macos.sh',
          ],
        },
        upload_step(),
      ],
    },
    */
]
