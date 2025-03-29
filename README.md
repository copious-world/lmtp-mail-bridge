
# lmtp-mail-bridge


Allows a local stmp server to pass data through an lmtp server to the copious endpoint servers.

## Install

```
npm install -g lmtp-mail-bridge
```

## Invoke

```
lmtp-mail-bridge lmtp_server.conf
```

## About

This is a local mail bridge taking mail from an STMP server such as Postfix and forwarding it on to copious.world endpoint servers.

At copious.world, we have this running on the same server as Postfix. Postfix is configured to forward unknown users to this ltmp server.
Those who write descendants of the server class this module provides, **SMTPBackendServer** can filer emails going forward to endpoint servers. 

The Postfix configuration, `/etc/postfix/main.cf`, starts to look like the following (after a few other lines):

```
smtpd_relay_restrictions = permit_mynetworks permit_sasl_authenticated defer_unauth_destination
myhostname = mail.example.net
alias_maps = hash:/etc/aliases
alias_database = hash:/etc/aliases
myorigin = /etc/mailname
mydestination = example.net, localhost.localdomain, localhost
local_recipient_maps =
relayhost =
mynetworks = 127.0.0.0/8, 192.168.1.0/24
mailbox_size_limit = 0
mailbox_transport = lmtp:inet:localhost:25

```

The mailbox transport is set to be internet on the localhost at port 25. 

**lmtp-mail-bridge** relies on the npm package `smp-server` and its sibling package `mailparser` to field and parse the mail messages coming in from the smpt server. The message will be turned one or more messages destined to one or two backend servers. One backend servers is a `mail` endpoint server found in the package [`copious-endpoints`](https://www.npmjs.com/package/copious-endpoints). The other backend server is a persistence server, such as the kind found in [`persistence-endpoints`](https://www.npmjs.com/package/persistence-endpoints).  The persistence endpoint takes in large files into a repository, reachable by a repository bridge. The lmtp server acts as a client to the persistence endpoint in order to add email attachments to the repository. For each email attachment that it adds, the repository id will be included in the message forwarded to the `mail` endpoint in place of the data file. 

The `mail` endpoint will process the JSON object representations of the emails it receives and make them available to a special application of a `copious-little-searcher`, a mail searcher. The mail searcher can be queried by a user interface to get lists of a user's email on a browser based mail user interface.

## Writing Special Case

In an npm project, the mail server class may be imported and extended. 

In your project directory, run the usual install command:

```
npm intall -s lmtp-mail-bridge
```


Then in your code, require the class, **SMTPBackendServer**

```
const SMTPBackendServer = require('lmtp-mail-bridge')
```


## Structure of an `lmtp_conf` file.

Here is an example lmtp_server.conf:

```
{
	"lmtp_conf" : {
	    "logger" : true,
	    "lmtp" : true,
	    "banner" : 'Welcome to My Awesome LMTP Server',
	    "disabledCommands" : [ "STARTTLS", "AUTH" ],
	    "size" : 10485760
	},
	"endpoint_conf" : {
		"address" : "192.168.0.24",
		"port' " : 5521
	},
	"server_port" : 25,
	"server_host" : "localhost"
}
```


*(where address and port depend on LAN settings)*


## Starting up endpoint connections

The endpoint server is set up in such a way that another tool on the LAN can request the startup of client services.  The endpoint configuration provides parameters for an endpoint server that is of the type `com_link_manager`.  This type of endpoint server waits for messages with configurations for clients to other endpoints. 

Until the endpoint clients are configured, messages received by the LTMP server are written to the console. When the clients have been configured and connected, the LMTP server sends messages on to the waiting endpoint servers wherever they may be. 

The `com_link_manager` manager tool must be invoked with configurations destined to the endpoint established by the LMTP server. In this case, the tool will be a temporary client of "192.168.0.24:5521". The `com_link_manager` should be called twice with one configuration for the `mail` endpoint server and another configuration to go with the `persistence` endpoint server.



