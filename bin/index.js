#!/usr/bin/env node

'use strict';


const fs = require('fs')
const SMTPBackendServer = require('../lib/lmtp-class')


let SERVER_PORT = 2524;
let SERVER_HOST = '0.0.0.0';

// Connect to this example server by running
//   telnet localhost 25
// or
//   nc -c localhost 25

let lmtp_conf = {
    // log to console
    logger: true,

    lmtp: true,

    // not required but nice-to-have
    banner: 'Welcome to My Awesome LMTP Server',

    // disable STARTTLS to allow authentication in clear text mode
    disabledCommands: ['STARTTLS', 'AUTH'],

    // Accept messages up to 10 MB
    size: 10 * 1024 * 1024
}

let link_manager_endpoint_conf = {}

let conf_file_name = "lmtp_service.conf"

let args2 = process.argv[2]
if ( args2 ) {
    conf_file_name = args2
}

try {
    //
    let conf_str = fs.readFileSync(conf_file_name).toString()
    let conf = JSON.parse(conf_str)
    //
    if ( typeof conf.lmtp_conf === "object" ) {
        lmtp_conf = conf.lmtp_conf
    } else if ( conf.lmtp_conf === "string" ) {
        let lmtp_conf_str = fs.readFileSync(conf.lmtp_conf).toString()
        lmtp_conf = JSON.parse(lmtp_conf_str)
    }
    if ( typeof lmtp_conf !== 'object' ) {
        throw new Error("lmtp conf is not an object")
    }

    //
    if ( typeof conf.link_manager_endpoint_conf === "object" ) {
        link_manager_endpoint_conf = conf.link_manager_endpoint_conf
    } else if ( conf.link_manager_endpoint_conf === "string" ) {
        let link_manager_endpoint_conf_str = fs.readFileSync(conf.link_manager_endpoint_conf).toString()
        link_manager_endpoint_conf = JSON.parse(link_manager_endpoint_conf_str)
    }
    //
} catch (e) {
    console.log("Error in configuration")
    process.exit(0)
}

// This tells smtp_server that this is in fact an lmtp server.
lmtp_conf.lmtp = true
//
if ( lmtp_conf.server_port !== undefined ) {
    let sp = parseInt(lmtp_conf.server_port)
    SERVER_PORT = sp
}
//
if ( lmtp_conf.server_host !== undefined ) {
    let sh = parseInt(lmtp_conf.server_host)
    SERVER_HOST = sh
}


// Setup server
const lmtp_server = new SMTPBackendServer(lmtp_conf,link_manager_endpoint_conf);

lmtp_server.on('error', err => {
    console.log('Error occurred');
    console.log(err);
});

// start listening
lmtp_server.listen(SERVER_PORT, SERVER_HOST);
