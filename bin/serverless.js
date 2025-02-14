#!/usr/bin/env node

'use strict';

const autocomplete = require('../lib/utils/autocomplete');
const BbPromise = require('bluebird');
const logError = require('../lib/classes/Error').logError;
const uuid = require('uuid');
const initializeErrorReporter = require('../lib/utils/sentry').initializeErrorReporter;

Error.stackTraceLimit = Infinity;

if (process.env.SLS_DEBUG) {
  // For performance reasons enabled only in SLS_DEBUG mode
  BbPromise.config({
    longStackTraces: true,
  });
}

process.on('unhandledRejection', e => {
  logError(e);
});
process.noDeprecation = true;

const invocationId = uuid.v4();

// boot up error reporting via sentry before anything
(() =>
  initializeErrorReporter(invocationId)
    .then(() => {
      if (process.argv[2] === 'completion') {
        return autocomplete();
      }
      // requiring here so that if anything went wrong,
      // during require, it will be caught.
      const Serverless = require('../lib/Serverless');

      const serverless = new Serverless();

      serverless.invocationId = invocationId;

      return serverless
        .init()
        .then(() => serverless.run())
        .catch(err => {
          // If Enterprise Plugin, capture error
          let enterpriseErrorHandler = null;
          serverless.pluginManager.plugins.forEach(p => {
            if (p.enterprise && p.enterprise.errorHandler) {
              enterpriseErrorHandler = p.enterprise.errorHandler;
            }
          });
          if (!enterpriseErrorHandler) {
            throw err;
          }
          return enterpriseErrorHandler(err, invocationId)
            .catch(error => {
              process.stdout.write(`${error.stack}\n`);
            })
            .then(() => {
              throw err;
            });
        });
    })
    .then(
      () => process.exit(0),
      e => {
        process.exitCode = 1;
        logError(e);
      }
    ))();
