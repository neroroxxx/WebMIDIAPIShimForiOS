/*

 Copyright 2013 Chris Wilson
 Copyright 2014-2015 Takashi Mizuhiki
 
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 
 http://www.apache.org/licenses/LICENSE-2.0
 
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 
 */

// This work was derived from WebMIDIAPIShim by Chris Wilson.
// https://github.com/cwilso/WebMIDIAPIShim

(function (global) {
    function Iterator(items) {
        this._items = items;
        this._index = 0;
        this._maxIndex = items.length;
    }
 
    Iterator.prototype.next = function(){
        if (this._index === this._maxIndex) {
            return {value: undefined, done: true};
        }

        return {value: this._items[this._index++], done: false};
    };
 
    Iterator.prototype.reset = function(){
        this._index = 0;
    };
 

    function Promise() {
    }

    Promise.prototype.then = function(accept, reject) {
        this.accept = accept;
        this.reject = reject;
    };

    Promise.prototype.succeed = function(access) {
        if (this.accept)
            this.accept(access);
    };

    Promise.prototype.fail = function(error) {
        if (this.reject)
            this.reject(error);
    };


    MIDIEventDispatcher = function MIDIEventDispatcher() {
        this._listeners = {};
    };

    MIDIEventDispatcher.prototype.addEventListener = function (type, listener, useCapture) {
        var listeners = this._listeners[type];
        if (listeners != null) {
            for (var i = 0; i < listeners.length; i++) {
                if (listeners[i] == listener) {
                    return;
                }
            }
        } else {
            this._listeners[type] = [];
        }

        this._listeners[type].push( listener );
    };
 
    MIDIEventDispatcher.prototype.removeEventListener = function (type, listener, useCapture) {
        var listeners = this._listeners[type];
        if (listeners != null) {
            for (var i = 0; i < listeners.length; i++) {
                if (listeners[i] == listener) {
                    this._listeners[type].splice( i, 1 );  //remove it
                    return;
                }
            }
        }
    };
 
    MIDIEventDispatcher.prototype.preventDefault = function() {
        this._pvtDef = true;
    };
 
    MIDIEventDispatcher.prototype.dispatchEvent = function (evt) {
        this._pvtDef = false;

        var listeners = this._listeners[evt.type];
        if (listeners != null) {
            // dispatch to listeners
            for (var i = 0; i < listeners.length; i++) {
                if (listeners[i].handleEvent) {
                    listeners[i].handleEvent.bind(this)( evt );
                } else {
                    listeners[i].bind(this)( evt );
                }
            }
        }

        switch (evt.type) {
            case "midimessage":
                if (this.onmidimessage) {
                    this.onmidimessage( evt );
                }
                break;

            case "connect":
                if (this.onconnect) {
                    this.onconnect( evt );
                }
                break;

            case "disconnect":
                if (this.ondisconnect) {
                    this.ondisconnect( evt );
                }
                break;
        }

        return this._pvtDef;
    };

    MIDIAccess = function(options) {
        this._promise = new Promise;
        this._sources = null;
        this._destinations = null;
        this._inputs = null;
        this._outputs = null;
        this._timestampOrigin = 0;
        this.onconnect = null;
        this.ondisconnect = null;
        this.sysexEnabled = true;
        this.inputs = null;
        this.outputs = null;
        _this = this;

        _callback_onReady = function(sources, destinations) {
            _this._timestampOrigin = window.performance.now();
 
            var inputs = new Array(sources.length);
            for (var i = 0; i < sources.length; i++ ) {
                inputs[i] = new MIDIInput( sources[i].id, sources[i].name, sources[i].manufacturer, i );
            }
 
            _this._inputs = inputs;
            _this.inputs = _createMIDIPortMap(inputs);
 
            var outputs = new Array(destinations.length);
            for (var i = 0; i < destinations.length; i++ ) {
                outputs[i] = new MIDIOutput( destinations[i].id, destinations[i].name, destinations[i].manufacturer, i );
            }

            _this._outputs = outputs;
            _this.outputs = _createMIDIPortMap(outputs);
 
            _onReady.bind(_this)();
        };

        _callback_onNotReady = function() {
            _onNotReady.bind(_this)();
        };
 
        _callback_receiveMIDIMessage = function(index, receivedTime, data) {
            var evt = document.createEvent( "Event" );

            evt.initEvent( "midimessage", false, false );
            evt.receivedTime = receivedTime + _this._timestampOrigin;
            evt.data = data;

            var input = _this._inputs[index];
            if (input != null) {
                input.dispatchEvent(evt);
            }
        };

        _callback_addDestination = function(index, portInfo) {
            var evt = document.createEvent( "Event" );
            var output = new MIDIOutput(portInfo.id, portInfo.name, portInfo.manufacturer, index);
 
            _this._outputs.splice(index, 0, output);
            _this.outputs = _createMIDIPortMap(_this._outputs);

            evt.initEvent( "connect", false, false );
            evt.port = output;
            _this.dispatchEvent(evt);
        };

        _callback_addSource = function(index, portInfo) {
            var evt = document.createEvent( "Event" );
            var input = new MIDIInput(portInfo.id, portInfo.name, portInfo.manufacturer, index);
 
            _this._inputs.splice(index, 0, input);
            _this.inputs = _createMIDIPortMap(_this._inputs);

            evt.initEvent( "connect", false, false );
            evt.port = input;
            _this.dispatchEvent(evt);
        };
 
        _callback_removeDestination = function(index) {
            var evt = document.createEvent( "Event" );

            evt.initEvent( "disconnect", false, false );

            var output = _this._outputs[index];
            if (output != null) {
                output.dispatchEvent(evt);
            }

            evt = document.createEvent( "Event" );
            evt.initEvent( "disconnect", false, false );
            evt.port = output;
            _this.dispatchEvent(evt);
 
            _this._outputs.splice(index, 1);
            _this.outputs = _createMIDIPortMap(_this._outputs);
        };

        _callback_removeSource = function(index) {
            var evt = document.createEvent( "Event" );
 
            evt.initEvent( "disconnect", false, false );

            var input = _this._inputs[index];
            if (input != null) {
                input.dispatchEvent(evt);
            }

            evt = document.createEvent( "Event" );
            evt.initEvent( "disconnect", false, false );
            evt.port = input;
            _this.dispatchEvent(evt);

            _this._inputs.splice(index, 1);
            _this.inputs = _createMIDIPortMap(_this._inputs);
        };
 
        var param = { "options": options, "url" : document.location.href };
 
        window.webkit.messageHandlers.onready.postMessage(param);
    };

    function _onReady() {
        if (this._promise)
            this._promise.succeed(this);
    }

    function _onNotReady() {
        if (this._promise)
            this._promise.fail( { code: 1 } );
    }

    function _createMIDIPortMap(list) {
        var size = list.length,
            values = [],
            keys = [],
            entries = [],
            portsById = {},
            port, i;
 
        for(i = 0; i < size; i++) {
            port = list[i];

            entries.push([port.id, port]);
            values.push(port);
            keys.push(port.id);
            portsById[port.id] = port;
        }
 
        keys = new Iterator(keys);
        values = new Iterator(values);
        entries = new Iterator(entries);
 
        return {
            size: size,
            forEach: function(cb) {
                var i, entry;
                for (i = 0; i < size; i++) {
                    entry = entries[i];
                    cb(entry[0], entry[1]);
                }
            },
            keys: function() {
                keys.reset();
                return keys;
            },
            values: function() {
                values.reset();
                return values;
            },
            entries: function() {
                entries.reset();
                return entries;
            },
            get: function(id) {
                return portsById[id];
            },
            has: function(id) {
                return portsById[id] !== undefined;
            }
        };
    }

    MIDIAccess.prototype = new MIDIEventDispatcher();


    MIDIPort = function MIDIPort() {
        this.id = 0;
        this.manufacturer = "";
        this.name = "";
        this.type = "";
        this.version = "";
        this.ondisconnect = null;
    };

    MIDIPort.prototype = new MIDIEventDispatcher();


    MIDIInput = function MIDIInput( id, name, manufacturer, index ) {
        this._index = index;
        this.id = id;
        this.manufacturer = manufacturer;
        this.name = name;
        this.type = "input";
        this.version = "";
        this.onmidimessage = null;
    };

    MIDIInput.prototype = new MIDIPort();
 
 
    MIDIOutput = function MIDIOutput( id, name, manufacturer, index ) {
        this._index = index;
        this.id = id;
        this.manufacturer = manufacturer;
        this.name = name;
        this.type = "output";
        this.version = "";
    };
 
    MIDIOutput.prototype = new MIDIPort();

    MIDIOutput.prototype.send = function( data, timestamp ) {
        var delayBeforeSend = 0;
        if (data.length === 0) {
            return false;
        }

        if (timestamp) {
            delayBeforeSend = timestamp - window.performance.now();
        }

        MIDIOutputData = function ( outputPortIndex, data, deltaTime ) {
            this.outputPortIndex = outputPortIndex;
            this.data = data.map(function(i) { return Number(i); }); // convert "data" to an array of Number
            this.deltaTime = deltaTime;
        };

        var outputData = new MIDIOutputData(this._index, data, delayBeforeSend);

        window.webkit.messageHandlers.send.postMessage(outputData);

        return true;
    };

    _requestMIDIAccess = function _requestMIDIAccess( options ) {
        var access = new MIDIAccess( options );
        return access._promise;
    };

    if (!window.navigator.requestMIDIAccess) {
        window.navigator.requestMIDIAccess = _requestMIDIAccess;
    }

}(window));

// Polyfill window.performance.now() if necessary.
(function (exports) {
    var perf = {}, props;

    function findAlt() {
        var prefix = ['moz', 'webkit', 'o', 'ms'],
        i = prefix.length,
            //worst case, we use Date.now()
            props = {
                value: (function (start) {
                    return function () {
                        return Date.now() - start;
                    };
                }(Date.now()))
            };
  
        //seach for vendor prefixed version
        for (; i >= 0; i--) {
            if ((prefix[i] + "Now") in exports.performance) {
                props.value = function (method) {
                    return function () {
                        exports.performance[method]();
                    }
                }(prefix[i] + "Now");
                return props;
            }
        }
  
        //otherwise, try to use connectionStart
        if ("timing" in exports.performance && "connectStart" in exports.performance.timing) {
            //this pretty much approximates performance.now() to the millisecond
            props.value = (function (start) {
                return function() {
                    Date.now() - start;
                };
            }(exports.performance.timing.connectStart));
        }
        return props;
    }
  
    //if already defined, bail
    if (("performance" in exports) && ("now" in exports.performance))
        return;
    if (!("performance" in exports))
        Object.defineProperty(exports, "performance", {
            get: function () {
                return perf;
            }});
        //otherwise, performance is there, but not "now()"
  
    props = findAlt();
    Object.defineProperty(exports.performance, "now", props);
}(window));
