'use strict';

const MailParser = require('mailparser').MailParser;
const LinkManager = require('com_link_manager')
const {nearest_media_type} = require('global_persistence')

// Replace '../lib/smtp-server' with 'smtp-server' when running this script outside this directory
const SMTPServer = require('smtp-server').SMTPServer;

const SERVER_PORT = 2524;
const SERVER_HOST = '0.0.0.0';

// Connect to this example server by running
//   telnet localhost 2524
// or
//   nc -c localhost 2524

let lmtp_server = false

class SMTPBackendServer extends SMTPServer {

    constructor(smtp_conf,endpoint_conf) {
        super(smtp_conf)

        this.link_manager = new LinkManager(endpoint_conf)
        this.link_manager.add_instance_paths("mail",this)

        this.messenger = false
        this.pesistence = false;
    }

    install_service_connection(instance,conf) {
    }

    update_service_connection(instance,conf) {
    }

    remove_service_connection(instance,conf) {
    }

    /**
     * set_messenger
     * 
     * @param {*} path 
     * @param {*} instance 
     * @param {*} conf 
     */
    async set_messenger(path,instance,conf) {
        if ( (path !== 'mail') && (path !== 'persistence') ) {
            return
        }
        if ( path === 'mail' ) {
            this.messenger = instance
        }
        if ( path === 'pesistence' ) {
            this.pesistence = instance
        }
    }

    /**
     * update_messenger
     * 
     * @param {*} path 
     * @param {*} instance 
     * @param {*} conf 
     */
    async update_messenger(path,instance,conf) {
        if ( path !== 'email' ) return
        //
        if ( !(this.messenger && instance ) )  {
            this.messenger = instance
        }
        //
        if ( typeof this.messenger.add_relay_path === 'function' ) {
            this.messenger.add_relay_path(conf)
            await this.messenger.ready()
        }
    }

    /**
     * close_messenger
     * 
     * @param {*} path 
     * @param {*} instance 
     * @param {*} conf 
     */
    async close_messenger(path,instance,conf) {
        if ( !(this.messenger && instance ) )  {
            this.messenger = instance
        }
        //
        if ( typeof this.messenger.remove_relay_path === 'function' ) {
            this.messenger.remove_relay_path(conf)
            await this.messenger.ready()
        } else if ( typeof this.messenger.closeAll === 'function' ) {
            await this.messenger.closeAll()
        }
    }


    /*
    
    upload_record = {
        "_tracking" : tracking,             // tracking of the asset
        "_id" :  this._user_id,             // should be a UCWID  ... from the client ... will be single user context
        "_author_tracking" :  this._author_tracking,
        "_paid" : paid,
        "_transition_path" : "asset_path",
        "asset_path" : `${tracking}+${asset_type}+${this._user_id}`,
        "title" : encodeURIComponent(title),
        "subject" : encodeURIComponent(subject),
        "keys" : keys,
        "asset_type" : asset_type,        // blog, stream, link-package, contact, ownership, etc...
        "media_type" : media_type,        // text, audio, video, image
        "abstract" : encodeURIComponent(abstract),
        "encode" : true,
        "txt_full" : encodeURIComponent(full_text),
        "media" : {
            "poster" : poster,
            "source" : media_data
        },
        "dates" : {
            "created" : Date.now(),
            "updated" : modDate
        },
        "_history" : this._current_asset_history ? this._current_asset_history : [],
        "_prev_text" : this._current_asset_prev_text,
        "text_ucwid_info" : this._current_asset_text_ucwid_info,
        "repository_fields" : repository_fields,
        "exclusion_fields" : exclusion_fields,
    
        //
        "topic" : "command-upload",
        "path" : "upload-media",
        "file_name" : data_hash,
    
    
        postable.ucwid = user_info.ccwid
        postable.session = session
        postable.hash = data.hash
        postable.public_signer = g_current_pub_identity.signer_public_key
        postable.axiom_public_key = g_current_pub_identity.axiom_public_key
    
    }
    
    */

    id_from_to(list_of_to) {
        return list_of_to.join(',')   /// make this more sophisticated
    }
    

    // convert to the persistence format
    convert_to_persistence_object(attch,mailobj) {
        //
        let attr_descr = Object.assign({},mailobj.headers)
        let tmp_uid =  this.id_from_to(mailobj.to)
        let pobj = Object.assign(attr_descr,
        {
            "subject" : mailobj.subject,
            "title" : mailobj.subject,
            "_tracking" : attch.partId,  // may change after adding
            "_id" :  tmp_uid,             // should be a UCWID  ... from the client ... will be single user context
            "_author_tracking" :  this._author_tracking,
            "_paid" : false,
            "_transition_path" : "asset_path",
            "asset_path" : `${attch.partId}+mail:attachment+${tmp_uid}`,
            "encode" : false,
            "media_type" : nearest_media_type(attch.contentType),
            "asset_type" : "mail:attachment",
            "description" : mailobj.from,
            "abstract" : "",
            "keys" : [attch.partId, mailobj.from,tmp_uid],
            "txt_full" : "attachment",
            "_history" : [],
            "_prev_text" : "",
            "_x_link_counter" : "",
            "ucwid_info" : false,
            "ucwid" : false,
            "_is_encrypted" : false,
            "dates" : {
                "created" : mailobj.date,
                "updated" : mailobj.date
            },
            "media" : {
                "name" : attch.filename,
                "source" : {
                    "blob_url" : attch.content,
                    "protocol" : "local_lan",
                    "local_lan" : false
                },
                "mime_type" : attch.contentType
            }
        })

        //
        return pobj
    }


    async relay_attachments(mailobj) {
        let attachments = mailobj.attachments
        let id_list_promises = []
        for ( let attch of attachments ) {
            let p_object = this.convert_to_persistence_object(attch,mailobj)
            id_list_promises.push(this.new_entry(p_object))  // send the attachment to persistence
        }
        let id_list = await Promise.all(id_list_promises)
        return id_list
    }

    message_for(mailobj) {
        let t_list = mailobj.headers.to
        if ( t_list.length === 1 ) {
            let msg = {
                "mail" : t_list[0],
                "data" : mailobj
            } 
            return msg  
        } else {
            let msgs = []
            for ( let to of t_list ) {
                let msg = {
                    "mail" : to,
                    "data" : mailobj
                }
                msgs.push(msg)  
            }
            return msgs
        }
    }

}




const smtp_conf = {
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

        mailparser.on('end', async () => {
            if ( lmtp_server.messenger ) {
                if ( mailobj.attachments.length ) { // convert attachments to identifiers
                    mailobj.attachments = await lmtp_server.relay_attachments(mailobj)
                }
                let mail_msg = this.message_for(mailobj)
                if ( Array.isArray(mail_msg) ) {
                    let promises = []
                    for ( let m_msg of mail_msg ) {
                        promises.push(lmtp_server.messenger.set_on_path(m_msg,"mail"))
                    }
                    await Promise.all(promises)
                } else {
                    await lmtp_server.messenger.set_on_path(mail_msg,"mail")
                }
            } else {
                process.stdout.write(JSON.stringify(mailobj, (k, v) => (k === 'content' || k === 'release' ? undefined : v), 3));
            }
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
}



// Setup server
lmtp_server = new SMTPBackendServer(smtp_conf,endpoint_conf);

lmtp_server.on('error', err => {
    console.log('Error occurred');
    console.log(err);
});

// start listening
lmtp_server.listen(SERVER_PORT, SERVER_HOST);
