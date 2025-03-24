/* eslint no-console: 0 */

'use strict';

// Replace '../lib/smtp-server' with 'smtp-server' when running this script outside this directory
const SMTPServer = require('smtp-server').SMTPServer;

const SERVER_PORT = 2524;
const SERVER_HOST = '0.0.0.0';

// Connect to this example server by running
//   telnet localhost 2524
// or
//   nc -c localhost 2524

// Setup server
const server = new SMTPServer({
    // log to console
    logger: true,

    lmtp: true,

    // not required but nice-to-have
    banner: 'Welcome to My Awesome LMTP Server',

    // disable STARTTLS to allow authentication in clear text mode
    disabledCommands: ['STARTTLS', 'AUTH'],

    // Accept messages up to 10 MB
    size: 10 * 1024 * 1024,

    // Validate MAIL FROM envelope address. Example allows all addresses that do not start with 'deny'
    // If this method is not set, all addresses are allowed
    onMailFrom(address, session, callback) {
        if (/^deny/i.test(address.address)) {
            return callback(new Error('Not accepted'));
        }
        callback();
    },

    // Validate RCPT TO envelope address. Example allows all addresses that do not start with 'deny'
    // If this method is not set, all addresses are allowed
    onRcptTo(address, session, callback) {
        let err;

        if (/^deny/i.test(address.address)) {
            return callback(new Error('Not accepted'));
        }

        // Reject messages larger than 100 bytes to an over-quota user
        if (address.address.toLowerCase() === 'almost-full@example.com' && Number(session.envelope.mailFrom.args.SIZE) > 100) {
            err = new Error('Insufficient channel storage: ' + address.address);
            err.responseCode = 452;
            return callback(err);
        }

        callback();
    },

    // Handle message stream
    onData(stream, session, callback) {

        let mailparser = new MailParser();
        //
        let subject = ""
        let text = ""

        let mailobj = {
            from: session.envelope.mailFrom,
            to: session.envelope.rcptTo,
            headers : false,
            attachments : [],
            text : {}
        };

        mailparser.on('headers', headers => {
            let headerObj = {};
            for (let [k, v] of headers) {
                // We don’t escape the key '__proto__'
                // which can cause problems on older engines
                headerObj[k] = v;
            }
        
            mailobj.headers = headerObj;
        });
        
        mailparser.on('data', data => {
            if (data.type === 'attachment') {
                mailobj.attachments.push(data);
                data.content.on('readable', () => data.content.read());
                data.content.on('end', () => data.release());
            } else {
                mailobj.text = data;
            }
        });
        
        mailparser.on('end', () => {
            // but send it to global persistence....
            process.stdout.write(JSON.stringify(mailobj, (k, v) => (k === 'content' || k === 'release' ? undefined : v), 3));
        });

        // 
        stream.pipe(mailparser);
        stream.on('end', () => {  // wraps callback
            let err;
            if (stream.sizeExceeded) {
                err = new Error('Error: message exceeds fixed maximum message size 10 MB');
                err.responseCode = 552;
                return callback(err);
            }
            callback(null, true); // accept the message once the stream is ended
        });


    }
});

server.on('error', err => {
    console.log('Error occurred');
    console.log(err);
});

// start listening
server.listen(SERVER_PORT, SERVER_HOST);