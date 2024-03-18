local default_deps = 'npm yarn';
local default_windows_deps = 'zip nsis npm yarn';
local docker_image = 'registry.oxen.rocks/session-desktop-builder-unstable';

local playwright_repo = 'https://github.com/burtonemily/session-playwright.git';
local playwright_branch = 'disappearing-messages';

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
                      targets,
                      arch='amd64',
                      image=docker_image,
                      deps=default_deps,
                      upload=true,
                      allow_fail=false,
                      extra_steps=[]) = {
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
         (if upload then [upload_step(image)] else []) +
         extra_steps,
};

local playwright(shards=9, image=docker_image) = [{
  name: 'Playwright build',
  depends_on: 'Build',
  image: image,
  commands: [
    'git clone ' + playwright_repo + ' -b ' + playwright_branch + ' session-playwright',
    'cd session-playwright',
    'yarn install --frozen',
  ],
}] + [
  {
    name: 'shard ' + i + '/' + shards,
    depends_on: 'Playwright build',
    image: image,
    commands: ['time xvfb-run --auto-servernum yarn test --shard=' + i + '/' + shards],
  }
  for i in std.range(1, shards)
];


[
  //debian_pipeline('Lint & Tests', ['grunt', 'lint-full', 'test'], upload=false),
  debian_pipeline('Linux deb (amd64)', ['build-release:linux-deb']),
  debian_pipeline('Linux rpm (amd64)', ['build-release:linux-rpm']),
  debian_pipeline('Linux freebsd (amd64)', ['build-release:linux-freebsd']),
  debian_pipeline('Linux AppImage (amd64)', ['build-release:linux-appimage']),
  debian_pipeline('Playwright', ['build-everything'], extra_steps=playwright()),
  //debian_pipeline('Windows (x64)', ['win32']),
  //debian_pipeline('Linux (ARM64)', ['deb'], arch='arm64'),

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
