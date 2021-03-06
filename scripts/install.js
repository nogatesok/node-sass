/*!
 * node-sass: scripts/install.js
 */

var fs = require('fs'),
  eol = require('os').EOL,
  mkdir = require('mkdirp'),
  path = require('path'),
  sass = require('../lib/extensions'),
  request = require('request'),
  log = require('npmlog'),
  pkg = require('../package.json'),
  userAgent = require('./util/useragent');

/**
 * Download file, if succeeds save, if not delete
 *
 * @param {String} url
 * @param {String} dest
 * @param {Function} cb
 * @api private
 */

function download(url, dest, cb) {
  var reportError = function(err) {
    var timeoutMessge;

    if (err.code === 'ETIMEDOUT') {
      if (err.connect === true) {
        // timeout is hit while your client is attempting to establish a connection to a remote machine
        timeoutMessge = 'Timed out attemping to establish a remote connection';
      } else {
        timeoutMessge = 'Timed out whilst downloading the prebuilt binary';
        // occurs any time the server is too slow to send back a part of the response
      }

    }
    cb(['Cannot download "', url, '": ', eol, eol,
      typeof err.message === 'string' ? err.message : err, eol, eol,
      timeoutMessge ? timeoutMessge + eol + eol : timeoutMessge,
      'Hint: If github.com is not accessible in your location', eol,
      '      try setting a proxy via HTTP_PROXY, e.g. ', eol, eol,
      '      export HTTP_PROXY=http://example.com:1234',eol, eol,
      'or configure npm proxy via', eol, eol,
      '      npm config set proxy http://example.com:8080'].join(''));
  };

  var successful = function(response) {
    return response.statusCode >= 200 && response.statusCode < 300;
  };

  var options = {
    rejectUnauthorized: false,
    proxy: getProxy(),
    timeout: 60000,
    headers: {
      'User-Agent': userAgent(),
    }
  };

  console.log('Start downloading binary at', url);

  try {
    request(url, options, function(err, response) {
      if (err) {
        reportError(err);
      } else if (!successful(response)) {
        reportError(['HTTP error', response.statusCode, response.statusMessage].join(' '));
      } else {
        cb();
      }
    })
    .on('response', function(response) {
      var length = parseInt(response.headers['content-length'], 10);
      var progress = log.newItem(url, length);

      if (successful(response)) {
        response.pipe(fs.createWriteStream(dest));
      }

      // The `progress` is true by default. However if it has not
      // been explicitly set it's `undefined` which is considered
      // as far as npm is concerned.
      if (process.env.npm_config_progress !== false) {
        log.enableProgress();

        response.on('data', function(chunk) {
          progress.completeWork(chunk.length);
        })
        .on('end', progress.finish);
      }
    });
  } catch (err) {
    cb(err);
  }
}

/**
 * Determine local proxy settings
 *
 * @param {Object} options
 * @param {Function} cb
 * @api private
 */

function getProxy() {
  return process.env.npm_config_https_proxy ||
         process.env.npm_config_proxy ||
         process.env.npm_config_http_proxy ||
         process.env.HTTPS_PROXY ||
         process.env.https_proxy ||
         process.env.HTTP_PROXY ||
         process.env.http_proxy;
}

/**
 * Check and download binary
 *
 * @api private
 */

function checkAndDownloadBinary() {
  if (process.env.SKIP_SASS_BINARY_DOWNLOAD_FOR_CI) {
    console.log('Skipping downloading binaries on CI builds');
    return;
  }
  var binaryPath = sass.getBinaryPath();

  if (sass.hasBinary(binaryPath)) {
    return;
  }

  mkdir(path.dirname(binaryPath), function(err) {
    if (err) {
      console.error(err);
      return;
    }

    var cachePath = path.join(sass.getCachePath(), pkg.name, pkg.version);
    var cacheBinary = path.join(cachePath, sass.getBinaryName());
    if (fs.existsSync(cacheBinary)) {
      console.log('Found existing binary in ' + cacheBinary);
      fs.createReadStream(cacheBinary).pipe(fs.createWriteStream(binaryPath));
    } else {
      // In case the cache path doesn't exist
      mkdir(cachePath, function(err) {
        if (err) {
          console.error(err);
          return;
        }

        download(sass.getBinaryUrl(), cacheBinary, function(err) {
          if (err) {
            console.error(err);
            return;
          }

          console.log('Binary downloaded to ' + cacheBinary);
          fs.createReadStream(cacheBinary).pipe(fs.createWriteStream(binaryPath));
        });
      });
    }
  });
}

/**
 * If binary does not exist, download it
 */

checkAndDownloadBinary();
