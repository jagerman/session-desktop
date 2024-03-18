local default_deps = 'npm yarn';
local default_windows_deps = 'zip nsis npm yarn';
local docker_image = 'registry.oxen.rocks/session-desktop-builder-unstable';

local apt_get_quiet = 'apt-get -o=Dpkg::Use-Pty=0 -q';

local upload_step(image='') = {
  name: 'Upload',
  [if image != '' then 'image']: image,
  commands: [
    'ls -l release',
    './tools/ci/drone-upload.sh',
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
             './tools/ci/install-deps.sh',
           ] + ['yarn ' + t for t in targets],
         }] +
         (if upload then [upload_step(image)] else []),
};


[
  debian_pipeline('Lint & Tests', docker_image, ['grunt', 'lint-full', 'test'], upload=false),
  debian_pipeline('Linux deb (amd64)', docker_image, ['build-release:linux-deb']),
  debian_pipeline('Linux rpm (amd64)', docker_image, ['build-release:linux-rpm']),
  debian_pipeline('Linux freebsd (amd64)', docker_image, ['build-release:linux-freebsd']),
  debian_pipeline('Linux AppImage (amd64)', docker_image, ['build-release:linux-appimage']),
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
