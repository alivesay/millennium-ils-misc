const soap = require('soap');
const prompt = require('prompt');
const util = require('util');
const winston = require('winston');
const fs = require('fs');
const async = require('async');
const smooth = require('smooth')(10);
const sleep = require('sleep');
const ProgressBar = require('progress');

const config = require('./config.json');

var stats = {
  patronsProcessed: 0,
  finesWaived: 0,
  errorCount: 0
};

console.log('Loading locations...');
var locations = fs.readFileSync('./locations.txt').toString().split('\n'); locations.pop();
console.log(locations.length + ' locations loaded.');

console.log('Loading patrons...');
var patrons = fs.readFileSync('./patrons.txt').toString().split('\n'); patrons.pop();
console.log(patrons.length + ' patrons loaded.');


var bar = new ProgressBar('   Waiving Fines: [:pnumber]: [:bar] :percent :etas   [ errors: :errorCount ]', { width: 30, total: patrons.length });

var logger = new (winston.Logger) ({
  transports: [
    new (winston.transports.File) ({ filename: '/var/log/iiigpc/iiigpc.log', level: 'debug' })
  ]
});

winston.remove(winston.transports.Console);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

const wsdlUrl = 'https://' + config.catalogHostname + '/iii/patronio/services/PatronIO?wsdl';

const promptSchema = {
  properties: {
    username: {
      description: 'Sierra Login',
      required: true
    },
    password: {
      description: 'Sierra Password',
      hidden: true
    }
  }
};

prompt.message = '';
prompt.delimiter = ':';

function start() {
  soap.createClient(wsdlUrl, function (err, client) {
    if (err) throw err;

    prompt.start();
    prompt.get(promptSchema, function (err, result) {
      apiReady(result.username, result.password, client);
    });

 });
}

var currentPatron = 0;

var done = false;

function apiReady(username, password, client) {
  async.eachLimit(patrons, 10, function (pnumber, callback) {
    getPatron(client, username, password, pnumber, function (patron, err){
      if (err || patron == null) {
        stats.errorCount++;
        bar.tick({'pnumber': pXXXXXXXX, 'errorCount': stats.errorCount});
        return callback(null);
      }
      processPatronFines(client, username, password, patron, function (err) {
        if (err) {
          stats.errorCount++;
          bar.tick({'pnumber': patron.patronID.$value, 'errorCount': stats.errorCount});
          return callback(err);
        } 

        //console.log('done: ' + patron);
        bar.tick({'pnumber': patron.patronID.$value, 'errorCount': stats.errorCount});
        return callback(null);
      });
    });
  }, function (err) {
    if (err) {
       // console.log(err);
       return;
    }
    done = true;
  });
}

function fineToObject(fine) {
  if (fine.attributes === undefined || fine.itemCharge === undefined) return null;

  return {
    id: fine.attributes.id,
    amountPaid: fine.amountPaid.$value,
    chargeLocation: fine.chargeLocation.$value,
    chargeType: fine.chargeType.$value,
    itemCharge: fine.itemCharge.$value,
    invoice: fine.invoice.$value
  };
}

function getPatron(client, username, password, pnumber, callback) {
    //console.log('request: ' + pnumber);

    var params = {
      username: username,
      password: password,
      searchString: '.' + pnumber
    };

    client.searchPatrons(params, function (err, result, raw, soapHeader) {
      if (err) { 
        //console.log('failure: ' + pnumber);
        //console.log(err);
        return callback(null, err);
      }

      stats.patronsProcessed++;
      return callback(result.searchPatronsReturn, null);
    });
}

function processPatronFines(client, username, password, patron, callback) {
  async.eachSeries(patron.patronFines.patronFines, function (fine, doneFine) {
      var fineObj = fineToObject(fine);
      if ((fineObj)  && (locations.indexOf(fineObj.chargeLocation) > -1) && (fineObj.chargeType === 'Overdue' || fineObj.chargeType === 'Overdue Renewal' || fineObj.chargeType === 'Adjustment')) {
        waivePatronFine(client, username, password, patron.patronID.$value, fineObj, function (err) {
          if (err) {
            //console.log(err);
            return doneFine(err);
          } else {
            stats.finesWaived++;
            return doneFine(null);
          }
        });
      } else {
        return doneFine(null);
      }
  }, function (err) {
    return callback(err);
  });
}

function waivePatronFine(client, username, password, patronID, fine, callback) {
  //console.log('waiving: ' + patronID + ': ' + JSON.stringify(fine));
  client.payPatronFine({
    username: username,
    password: password,
    patron: {
      patronID: patronID,
      patronFields: {},
      finePayment: {
        someArrayItem: {
          amount: Number(fine.itemCharge),
          initials: 'andrewl',
          invoice: fine.invoice + '',
          type: '2'
        }
      }
    }
  }, function (err, result, raw, soapHeader) {
    return callback(err);
  });
}

start();

function run() {
  if(done) {
    console.log('Patrons Processed: ' + stats.patronsProcessed);
    console.log('Fines Waived: ' + stats.finesWaived);
  } else {
    setImmediate(run);
  }
}

run();
