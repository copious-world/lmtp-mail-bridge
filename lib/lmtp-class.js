'use strict';

const MailParser = require('mailparser').MailParser;
const LinkManager = require('com_link_manager')
const {nearest_media_type} = require('global_persistence')



// Replace '../lib/smtp-server' with 'smtp-server' when running this script outside this directory
const SMTPServer = require('smtp-server').SMTPServer;



/*

        // REFERENCE UPLOAD RECORD
    
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
    
    
        // postable.ucwid = user_info.ccwid
        // postable.session = session
        // postable.hash = data.hash
        // postable.public_signer = g_current_pub_identity.signer_public_key
        // postable.axiom_public_key = g_current_pub_identity.axiom_public_key
    
    }
    

headers a Map value that holds MIME headers for the attachment node

    */


class SMTPBackendServer extends SMTPServer {

    constructor(lmtp_conf,endpoint_conf) {
        super(lmtp_conf)

        this.link_manager = new LinkManager(endpoint_conf)
        this.link_manager.add_instance_paths("mail",this)

        this.messenger = false
        this.pesistence = false;

        if ( lmtp_server ) {
            throw new Error("The LMTP SERVER HAS ALREADY BEEN CONSTRUCTED")
        }

        g_lmtp_server = this
    }

    construct_mail_parser(mail_from,rcpt_to) {
        //
        let mailparser = new MailParser();
        this.mail_parser = mailparser
        //

        let self = this
        
        let mailobj = {
            from: mail_from, //session.envelope.mailFrom,
            to: rcpt_to,  //session.envelope.rcptTo
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
            if ( self.messenger ) {
                if ( mailobj.attachments.length ) { // convert attachments to identifiers
                    mailobj.attachments = await self.relay_attachments(mailobj)
                }
                let mail_msg = self.message_for(mailobj)
                if ( Array.isArray(mail_msg) ) {    // more than one recipient
                    let promises = []
                    for ( let m_msg of mail_msg ) {
                        promises.push(self.messenger.set_on_path(m_msg,"mail"))
                    }
                    await Promise.all(promises)
                } else {                            // just one recipient
                    await self.messenger.set_on_path(mail_msg,"mail")
                }
            } else {
                process.stdout.write(JSON.stringify(mailobj, (k, v) => (k === 'content' || k === 'release' ? undefined : v), 3));
            }
        });
    }




    // OVERRIDE
    // Validate MAIL FROM envelope address. Example allows all addresses that do not start with 'deny'
    // If this method is not set, all addresses are allowed
    onMailFrom(address, session, callback) {
        if (/^deny/i.test(address.address)) {
            return callback(new Error('Not accepted'));
        }
        callback();
    }

    // OVERRIDE
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
    }

    // OVERRIDE
    // Handle message stream
    onData(stream, session, callback) {
        //
        let mail_from = session.envelope.mailFrom
        let rcpt_to = session.envelope.rcptTo

        let mailparser = this.construct_mail_parser(mail_from,rcpt_to)
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
        //
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

    id_from_to(list_of_to) {
        return list_of_to.join(',')   /// make this more sophisticated
    }

    to_blob_url(content,mime) {
        //
        let b64url = content.toString('base64url');
        //
        let blob_url = 'data:' + mime + ';' + 'base64url' + ',' + b64url; 
        return blob_url
    }

    extract_addr(from) {
        let value = from.value
        if ( value ) {
            let addr_obj = value[0]
            if ( addr_obj.address ) {
                return addr_obj.address
            }
        }
        return false
    }
    

    // convert to the persistence format
    convert_to_persistence_object(attch,mailobj) {
        if ( attch.related ) return false
        //
        let attr_descr = Object.assign({},mailobj.headers) // hearder converted to an object
        let from_addr = this.extract_addr(mailobj.from)

        if ( !from_addr ) return false

        let tmp_uid =  this.id_from_to(mailobj.to)
        let pobj = Object.assign(attr_descr,{
            //
                "subject" : mailobj.subject,
                "title" : mailobj.subject,
                "_tracking" : attch.partId,  // may change after adding
                "_id" :  tmp_uid,             // should be a UCWID  ... from the client ... will be single user context
                "_author_tracking" :  from_addr,
                "_paid" : false,
                "_transition_path" : "asset_path",
                "asset_path" : `${attch.partId}+mail:attachment+${tmp_uid}`,
                "encode" : false,
                "media_type" : nearest_media_type(attch.contentType),
                "asset_type" : ("mail:" + attch.contentDisposition),
                "description" : from_addr,
                "abstract" : "",
                "keys" : [attch.partId, mailobj.from, tmp_uid],
                "txt_full" : "attachment",
                "_history" : [],
                "_prev_text" : "",
                "_x_link_counter" : "",
                "ucwid_info" : false,
                "ucwid" : false,
                "_is_encrypted" : false,
                "dates" : {
                    "created" : mailobj.date.getTime(),
                    "updated" : mailobj.date.getTime()
                },
                "media" : {
                    "name" : attch.filename,
                    "source" : {
                        "blob_url" : this.to_blob_url(attch.content,attch.contentType),
                        "protocol" : "local_lan",
                        "local_lan" : false     // not stored yet
                    },
                    "mime_type" : attch.contentType,
                    "cid" : attch.cid,       // mail type of cid
                    "contentId" : attch.contentId,
                    "size" : attch.size,
                    "checksum" : checksum.checksum
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
            if ( p_object ) {
                id_list_promises.push(this.new_entry(p_object))  // send the attachment to persistence
            }
        }
        let id_list = await Promise.all(id_list_promises)
        return id_list
    }


    message_for(mailobj) {

        let t_list = mailobj.headers.get('to')
        t_list = t_list.concat(mailobj.get('cc'))
        t_list = t_list.concat(mailobj.get('bcc'))

        if ( t_list.length === 1 ) {
            let msg = {
                "mail" : this.extract_addr(t_list[0]),
                "data" : mailobj
            } 
            return msg  
        } else {
            let msgs = []
            for ( let to of t_list ) {
                let msg = {
                    "mail" : this.extract_addr(to),
                    "data" : mailobj
                }
                msgs.push(msg)  
            }
            return msgs
        }
    }

}





module.exports = SMTPBackendServer
