# 🔮 Portal.js

![License](https://img.shields.io/github/license/Andrew-Gallimore/Portal.js)
![GitHub Stars](https://img.shields.io/github/stars/Andrew-Gallimore/Portal.js)
![GitHub Issues](https://img.shields.io/github/issues/Andrew-Gallimore/Portal.js)

**A library for creating a *serverless* synced database between pages in the browser.**

Portal.js is a library that allows you to create a peer-to-peer synced database in the browser. It is built on top of [VDO.ninja](https://vdo.ninja) and uses purely peer-to-peer communication through iframes. This means that you don't need any servers or complex setup to use it!

Portal.js is particularly useful for creating real-time, collaborative web applications where data needs to be shared and synchronized between multiple users.

## Features

1. 👥 **Peer-to-peer communication**: Enables direct communication between different users (peers) without the need for a central server.
2. 🔔 **Channels**: Provides a way for peers to join specific channels for communication. A channel can be thought of as a room where peers can exchange messages or data.
3. 🌎 **Real-time updates**: Changes made by one peer can be instantly seen by all other peers in the same channel.

## Basic Usage

You can include the file `Portal.js` in your page, and the main `Portal` object can then be used.

```js
// Opens the channel "test1234", with specific data that should be synced "data_1" and "data_2", and it allows reading personal data (the "true").
Portal.openChannel("test1234", ["data_1", "data_2"], true);

// Listens for changed to "data_1" and "data_2", whether or not we made the change
Portal.on("data_1", function(data){
    console.log("data_1 updated: " + data);
});
Portal.on("data_2", function(data){
    console.log("data_2 updated: " + data);
});

// Creates push request to update the data
// (if it can't sync the change, the listener above won't be called)
Portal.setDB("data_1", "I'm the data");
```

See [index.html](/index.html) for expansive example code of how system works.

> [!IMPORTANT]
> Data keys shouldn't start with "portal-" as that is a reserved prefix for events from the portal system itself. For example if there is a startup error `portal-start-error` or if another peer joins `portal-peer-joined`. See a full list of built-in portal events you can listen too: [here](#built-in-events)

## Channel Structure

A channel is a way to organize and group peers together, allowing them to communicate and sync stored data with each other. However, channels can be used to limit the synced data for certain peers.

When creating a channel, you need to specify what data of the database should be synced with other peers in that channel. With multiple channels connected, if you limit what should be shared in one channel, from any other peers' perspective in that channel, there is only that limited set of data in the synced database.

> [!TIP]
> For example, you can have one 'more secure' channel that has access to all the data, and then have another 'less secure' channel with limited access to *specific* data only.


## Channel Write Rules

By default, all peers in a channel will have the ability to write to all the keys they have access too. In order to make some data *read only* by default for peers in a channel (unless they have the authority too) you can create a write-rule and associated write-key.

A **Write Rule** gives write authority to some peers/channels you choose over certain keys. The system relys on you distrubuting a **writeKey** (which is generated after creating a Write Rule) to **all** peers in the channel which should have read-only keys. Anyone who used the writeKey when loading the channel will be protected from unauthorized writes to keys it controls, maing the data practically read-only. When you create a write rule, it automatically distrubutes the rule to everyone you said to give wite authority too, and then asyncronously returns a `writeKey`, which you need to distrubute yourself. 

> [!IMPORTANT]
> Its important that all peers who want to be under the write protection provided by the write rule must load the channel with the same configuration including any writeKey(s). See [[Portal Security]](#portal-security) for more details.

> [!TIP]
> For example, you want channel A to have full read/write of `data_1` and `data_2` keys, and channel B to only have read access of `data_1`. You would create a Write Rule "Rule_1", and give that authority to anyone in channel A. Then, when loading the channel B, you add that "Rule_1" to `data_1`. This way, any people who have the authority by being in both channel A & B, can write to data_1. But if you are only in channel B (not having access to the Write Rule's authority in channel A), you can NOT write to `data_1`.


## Portal Security

There are three main methods of securing data in the Portal library:

1. You create channels with long and complex names, so the likelyhood of an outsider guessing the channel's name is low.

2. You only provide read access to keys that a channel NEEDS. From an outsiders point of view, they don't see any other keys than what is provided in the channel. And by being in a channel, peers don't know what other channels any other peers also have open.

3. You give write authority to some channel(s) over keys, and limit who can write to those keys by using the associated `writeKey` provided. If an outsider saw the keys, and tryed to write to the shared db without having the authority, assuming all other peers are using the `writeKey`, the outsider couldn't break anything.

To obtain the database's security, its important[[1]](#1) all peers use the same configuration. Other peer's experience won't be affected if someone fails to have the same read/write configuration -- like if a bad-actor is trying to cause havok.

> #### [1]
> Its important, but not nessesary that all peers load the channel with the same configuration (from a security stand-point). The Portal library aims to create a semi-abstracted layer of a single syncronized database, when its in-fact based on all peers having their own databases and sharing the same read/write configuration and therfore data. The read/write rules apply to what others can write/read to a peers local database, and so if everyone has the same configuration, all peers should share the perscribed data without limitations. If a peer fails to load the channel with the same read/write configuration, it will only affect their experience/security, and not others who all have the same 'correct' configuration.

## Built-in Events

| eventName | callbackParam(s) | description |
| - | - | - |
| portal-peer-connected | `peerObject` | When a peer joins one of the channels.
| portal-peer-disconnected | `UUID` of peer | When a peer leaves one of the channels.
| portal-error | object for the error *(1)* | When the library fails checks during initialization.
| portal-started | | When the library finishes initializaton without issues. If an error occures, this won't fire.
| portal-channel-error | `name` of channel | When channel times out when loading or otherwise fails.
| portal-channel-started | `name` of channel | When channel finishes loading and is working. If an error occured, this won't fire.
| *portal-db-started* | | When we have recived the current database from all channels, and can now use it.

> (1) Messages include: `{err: "webRTC", msg: "Portal requires WebRTC to work, but your browser doesn't support it."}`,