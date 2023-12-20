/**
 * A channel in the Portal, which peers will join through.
 * @param {String} name The name of the channel the channel will represent/open.
 */
class Channel {
    constructor(name) {
        this.name = name;
        this.iframe = undefined;
        this.loaded = false;

        // Timeout for if the room hasn't loaded by a certain point
        this.loadWaitime = 6000;

        // Bringing in the event system
        Object.assign(this, EventMixin);
    }

    /**
     * Starts channel loading. And dispatches an event for if its loaded.
     */
    load() {
        var iframe = document.createElement("iframe");
        iframe.src = "https://vdo.ninja/alpha/?room=" + this.name + "&vd=0&ad=0&autostart&cleanoutput";
        document.body.appendChild(iframe);
        this.iframe = iframe;

        Portal.channels.push(this);

        // Timeout for if the room hasn't loaded by a certain point
        setTimeout(() => {
            if(this.loaded === false) {
                this.dispatch("portal-chan-finished", false);
                this.close();
            }
        }, this.loadWaitime);
    }

    /**
     * Closes the channel, removing iframe and such.
     */
    close() {
        if(this.iframe) this.iframe.remove();
        this.loaded = false;
        for (let i = 0; i < Portal.channels.length; i++) {
            if(this === Portal.channels[i]) {
                Portal.channels.splice(i,1);
                break;
            }
        }
    }

    /**
     * Recived messages from iframe created
     * @param {Object} message The iframe message object.
     */
    onMessage(message) {
        if(message.data.action === "joined-room-complete") {
            // Channel finished loading
            this.dispatch("portal-chan-finished", true);
            this.loaded = true;
        }else if(message.data.action === "guest-connected") {
            // Creating a new guest
            var UUID = message.data.UUID;
            var peer = new Peer(UUID, this.name, this.iframe);
        }
    }
}

/**
 * A peer in a channel of the Portal, which messages can be sent too.
 * @param {String} UUID The uuid of the peer.
 * @param {String} channelName The name of the channel the peer is in.
 * @param {Element} iframe The iframe where the peer is from, and their messages will go through.
 */
class Peer {
    constructor(UUID, channelName, iframe) {
        this.UUID = UUID;
        this.channelName = channelName;
        this.iframe = iframe;
        this.conversations = {};

        // Putting peer in peers list
        Portal.peers.push(this);
    }

    /**
     * Recived messages from iframe created
     * @param {Object} message The iframe message object from vdo.ninja.
     */
    onMessage(message) {
        // Filtering messages to only data messages
        if(!message.data.dataReceived) return;

        // Checking if the message is part of a conversation
        if(message.data.dataReceived.conv && message.data.dataReceived.content) {
            // If the covnersation exists, that means we sent it and the callback hasn't been called yet
            if(this.conversations[message.data.dataReceived.conv]){
                // Calling responce callback for conversation
                this.conversations[message.data.dataReceived.conv].cb(message.data.dataReceived.content);
                delete this.conversations[message.data.dataReceived.conv];
            }else{
                // Handling the message as a conversation from another peer
                this.handleMessage(message);
            }
                
        }

        //TEMP: for debugging
        console.log(message.data)
    }

    /**
     * Handles a message from a peer, as it can be for different functions.
     * @description This assumes that the message has been filtered to be correct format already.
     */
    handleMessage(message) {
        if(message.data.dataReceived.content.push) {
            // ===== If a peer is trying to push data to the synced database =====

            // Checking if the data is already in the cue
            var found = false;
            for (let i = 0; i < Portal.cue.length; i++) {
                if(Portal.cue[i].key === message.data.dataReceived.content.push.key) {
                    found = true;
                    break;
                }
            }
            if(!found) {
                // Add it to cue.
                var pshreq = new PushRequest(message.data.dataReceived.content.push.id, message.data.dataReceived.content.push.key, message.data.dataReceived.content.push.data);
            }

            // Sending responce
            this.respond(message.data.dataReceived.conv, true);
        }else if(message.data.dataReceived.content.completeRequest) {
            // ===== If a peer is completing pushing data to the synced database =====

            // Checking if the data is in the cue (required to complete it)
            for (let i = 0; i < Portal.cue.length; i++) {
                if(Portal.cue[i].id === message.data.dataReceived.content.completeRequest.id) {
                    // Completing the request
                    console.log("ok3")
                    Portal.cue[i].completeRequest();

                    // Removing the push request from the cue
                    Portal.cue.splice(i,1);
                }
            }
        }else if(message.data.dataReceived.content.personalData) {
            // ===== If a peer is requesting personal data =====

            // Sending responce
            this.respond(message.data.dataReceived.conv, Portal.local[message.data.dataReceived.content.personalData.key]);
        }
    }

    /**
     * Sends a message to the peer, and waits for a responce.
     * @description The peer should automatically send a responce no matter what.
     * @param {Any} message Any type of data.
     * @param {Function} responceCallback A callback called (with responce message as arguement) when the peer responds to the message.
     */
    send(message, responceCallback) {
        // Making a new conversation
        var convID = Math.round(Math.random() * 10000000).toString();
        this.conversations[convID] = {cb: responceCallback};

        // Sending message
        this.iframe.contentWindow.postMessage({"sendData": {
            conv: convID,
            content: message
        }, "UUID": this.UUID}, '*');
    }

    /**
     * Responds to a conversation with a message.
     * @param {String} convID The id of the conversation to respond to.
     * @param {Any} message Any type of data.
     */
    respond(convID, message) {
        this.iframe.contentWindow.postMessage({"sendData": {
            conv: convID,
            content: message
        }, "UUID": this.UUID}, '*');
    }
}


/**
 * A push request for data to the synced Portal database
 * @param {String} id A custom id of the push request.
 * @param {String} channelName The name of the channel the push request should be sent too.
 * @param {String} key The key of the new data.
 * @param {Any} data The actual data to be put under the key.
 */
class PushRequest {
    constructor(id, channelName, key, data) {
        this.id = id;
        this.channelName = channelName;
        this.key = key;
        this.data = data;
        this.peersWithData = [];

        // Push this to the cue
        Portal.cue.push(this);
    }

    /*
     * Sends the push request to all peers in the channel.
    */
    sendToPeers() {
        for (let i = 0; i < Portal.peers.length; i++) {
            // Filtering peers to only ones in the same channel
            if(Portal.peers[i].channelName !== this.channelName) continue;
            
            // Send the push request
            Portal.peers[i].send({"push": {
                id: this.id,
                key: this.key,
                data: this.data
            }}, (responce) => {
                // If responce is true, then the peer has the data
                if(responce) {
                    // Add peer to list of peers with data
                    this.peersWithData.push(Portal.peers[i]);

                    // Check if enough peers have the data
                    if(this.checkEnoughPeers()) {
                        // Complete the request
                        this.completeRequest();

                        // Tell other peers to also complete the request
                        for (let i = 0; i < this.peersWithData.length; i++) {
                            this.peersWithData[i].send({"completeRequest": {
                                id: this.id
                            }});
                        }
                    }
                }
            });
        }
    }

    /*
     * Checks if enough peers have responded that they have the data
    */
    checkEnoughPeers() {
        // Right now just Checking if all peers have the data
        if(this.peersWithData.length >= Portal.peers.length) {
            return true;
        }
    }

    /*
     * Completes the push request, adding the data to the db and removing the push request from the cue.
    */
    completeRequest() {
        // Add the data to the db
        Portal.db[this.key] = this.data;

        // Emiting event that the data has been updated
        Portal.dispatch(this.key, this.data);

        // Removing the push request from the cue
        for (let i = 0; i < Portal.cue.length; i++) {
            if(Portal.cue[i].id === this.id) {
                Portal.cue.splice(i,1);
                break;
            }
        }
    }
}


/**
 * A mixin for objects/classes which contains an event system.
 */
var EventMixin = {
    DispatcherEvent: class {
        constructor(eventName) {
            this.eventName = eventName;
            this.callbacks = [];
        }
    
        registerCallback(callback) {
            this.callbacks.push(callback);
        }
    
        unregisterCallback(callback) {
            const index = this.callbacks.indexOf(callback);
            if (index > -1) {
                this.callbacks.splice(index, 1);
            }
        }
    
        fire(data) {
            const callbacks = this.callbacks.slice(0);
            callbacks.forEach((callback) => {
                callback(data);
            });
        }
    },

    /**
     * Dispatches an event, calling any callbacks registered with .on()
     * @param {String} eventName The name of the event to dispatch.
     * @param {Any} data Any data (of any type) that needs to get passed as an argument when .on() callbacks are called.
     */
    dispatch(eventName, data="") {
        const event = Portal.events[eventName];
        if(event) event.fire(data);
    },

    /**
     * Registers a callback for an event
     * @param {String} eventName The name of the event to listen for.
     * @param {Function} callback A callback function to be called when an event is dispatched
     */
    on(eventName, callback) {
        let event = Portal.events[eventName];
        if (!event) {
            event = new EventMixin.DispatcherEvent(eventName);
            Portal.events[eventName] = event;
        }
        event.registerCallback(callback);
    },

    /**
     * Removes a callback for an event
     * @param {String} eventName The name of the event to the callback was assigned too.
     * @param {Function} callback The callback function to be removed from the event.
     */
    off(eventName, callback) {
        const event = Portal.events[eventName];
        if (event && event.callbacks.indexOf(callback) > -1) {
            event.unregisterCallback(callback);
            if (event.callbacks.length === 0) {
                delete Portal.events[eventName];
            }
        }
    }
}



// Only create eventer if it doesn't exist in another file already
/**
 * An iframe message catcher and distrubution system, sending the messages to places needing them
*/
var eventer;
if(!eventer) {
    var eventMethod = window.addEventListener ? "addEventListener" : "attachEvent";
    var eventer = window[eventMethod];
    var messageEvent = eventMethod === "attachEvent" ? "onmessage" : "message";
    eventer(messageEvent, e => {
        // Pushing messages to different channels
        for (let i = 0; i < Portal.channels.length; i++) {
            if(e.source === Portal.channels[i].iframe.contentWindow) Portal.channels[i].onMessage(e);
        }
        // Pushing messages to different peers
        for (let i = 0; i < Portal.peers.length; i++) {
            if(e.data.UUID === Portal.peers[i].UUID) Portal.peers[i].onMessage(e);
        }
    });
}



/**
 * The main object containing all logic for the Portal system
*/
var Portal = {
    events: {},
    channels: [],
    peers: [],

    // Personal data that isn't synced, but can be shared when others request personal data
    local: {},

    // The Database uses basic syncing to secure data among clients
    db: {},
    // The temporary location for changes before they have been applied to the db.
    cue: [],


    /**
     * Makes a push request to set some data in the synced database.
     * @description Creates a new push request, and puts the data into the cue. If enough peers didn't recive the change in time, the change is reverted, otherwise its added to the db.
     * @param {String} key The key of the new data in the database.
     * @param {Any} data The actual data to be put under the key in the database.
    */
    setDB: (key, data) => {
        // Create new push request
        var id = Math.round(Math.random() * 10000000).toString();
        new PushRequest(id, key, data).sendToPeers();
    },

    /**
     * Sets some data in the local database.
     * @param {String} key The key of the new data in the database.
     * @param {Any} data The actual data to be put under the key in the database.
    */
    setLocal: (key, data) => {
        local[key] = data;
    },

    /**
     * Gets some data from the local database.
     * @param {String} key The key of the data in the database.
     * @returns {Any} The data under the key in the database.
    */
    getLocal: (key) => {
        return local[key];
    },

    /**
     * Opens a channel in the portal
     * @description Note: the channel automatically puts itself into the Portal.channels array
     * @param {String} name The name of the channel to be opened (the vdo.ninja roomname)
    */
    openChannel: (name) => {
        var chan = new Channel(name);
        chan.on("portal-chan-finished", (success) => {
            if(!success) {
                console.warn("Portal for '" + name + "' failed when loading. Didn't add it to Portal.channels");
            }
        })
        chan.load();
    }
}
// Bringing in the event system to the Portal obj.
Object.assign(Portal, EventMixin);