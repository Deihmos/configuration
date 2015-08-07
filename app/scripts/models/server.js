'use strict';

angular.module('configurationApp')
  .factory('Server', function(Connection, CSystem, PlexConnectionManager, VersionUtil, $q) {
    var identifier = 'com.plexapp.plugins.trakttv',
        pluginVersionMinimum = '0.9.10.3',
        target = 'MessageKit:Api';

    function Server() {
      this.name = null;

      this.identifier = null;
      this.plugin_version = null;

      this.token_channel = null;
      this.token_channel_expire = null;

      this.token_plex = null;

      this.client = null;
      this.connection_manager = null;

      this.error = null;
    }

    Server.prototype.isAuthenticated = function() {
      if(this.token_channel === null) {
        return false;
      }

      // TODO check token validity (via `token_channel_expire`)
      return true;
    };

    Server.prototype.authenticate = function() {
      var self = this;

      return CSystem.authenticate(this).then(function() {
        self.save();

      }, function(error) {
        self.error = error;

        return $q.reject();
      });
    };

    Server.prototype.connect = function() {
      var self = this;

      // Reset connection "error"
      self.error = null;

      // Test connections
      return this.connection_manager.test().then(function(connection) {
        // Check server
        return self.check().then(function() {
          return connection;
        }, function(error) {
          // Server didn't pass validation
          self.error = error;

          return $q.reject(error);
        });

      }, function(reason) {
        // Unable to connect to server
        self.error = {
          message: reason
        };

        return $q.reject(self.error);
      });
    };

    Server.prototype.check = function() {
      var self = this;

      return CSystem.ping(this).then(function(pong) {
        // Store server version
        self.plugin_version = pong.version;

        // Check plugin meets version requirement
        if(VersionUtil.compare(self.plugin_version, pluginVersionMinimum) >= 0) {
          return true;
        }

        // Plugin update required
        return $q.reject({
          message: 'Plugin update required'
        });
      }, function(error) {
        // Unable to ping server
        return $q.reject(error);
      });
    };

    Server.prototype.call = function(key, args, kwargs) {
      args = typeof args !== 'undefined' ? args : [];

      // insert `key` at the front of `args`
      args.splice(0, 0, key);

      // build headers
      var headers = {};

      if(this.token_channel !== null) {
        headers['X-Channel-Token'] = this.token_channel;
      }

      console.debug('[%s] Request "%s"', this.identifier, key, {
        args: args,
        kwargs: kwargs
      });

      // call api function
      var deferred = $q.defer();

      this.client['/:/plugins/*/messaging'].callFunction(
        identifier, target, args, kwargs, {
          headers: headers
        }
      ).then(function(data) {
        // Parse response
        if(typeof data === 'string') {
          data = JSON.parse(data);
        } else if(typeof data === 'object') {
          console.warn('Legacy response format returned');
        }

        // Return response
        console.debug('Response', data);

        if(data.result !== undefined) {
          deferred.resolve(data.result);
          return;
        }

        // Handle errors
        if(data.error !== undefined) {
          deferred.reject(data.error);
        } else {
          deferred.reject(null);
        }
      }, function(data, status) {
        deferred.reject(data, status);
      });

      return deferred.promise;
    };

    Server.prototype.get = function(path, config) {
      config = typeof config !== 'undefined' ? config : {};

      config.method = 'GET';

      config.headers = typeof config.headers !== 'undefined' ? config.headers : {};
      config.headers['X-Plex-Token'] = this.token_plex;

      return this.current.request(path, config);
    };

    Server.prototype._attributeKey = function(name) {
      return 'server.' + this.identifier + '.' + name;
    };

    Server.prototype.load = function() {
      if(this.identifier === null || typeof this.identifier === 'undefined') {
        return;
      }

      var self = this;

      function loadAttribute(name) {
        var value = localStorage[self._attributeKey(name)];

        if(value === null || typeof value === 'undefined') {
          return;
        }

        self[name] = value;
      }

      loadAttribute('token_plex');

      loadAttribute('token_channel');
      loadAttribute('token_channel_expire');
    };

    Server.prototype.save = function() {
      if(this.identifier === null || typeof this.identifier === 'undefined') {
        return;
      }

      var self = this;

      function saveAttribute(name) {
        localStorage[self._attributeKey(name)] = self[name];
      }

      saveAttribute('token_plex');

      saveAttribute('token_channel');
      saveAttribute('token_channel_expire');
    };

    Server.fromElement = function(e) {
      var s = new Server();

      // Set attributes
      s.name = e._name;

      s.identifier = e._clientIdentifier;
      s.token_plex = e._accessToken;

      if(typeof e.Connection.length === 'undefined') {
        e.Connection = [e.Connection];
      }

      // Build `Connection` objects
      var connections = _.map(e.Connection, function(e) {
        return Connection.fromElement(e);
      });

      s.connection_manager = new PlexConnectionManager(s, connections);

      // Load attributes from storage
      s.load();

      return s;
    };

    return Server;
  });
