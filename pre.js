'use strict';
require('./lib').run().then(code => { process.exitCode = code; });
