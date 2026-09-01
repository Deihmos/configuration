'use strict';

angular.module('configurationApp')
  .directive('coTraktLogin', function(Utils, $http, $q, $timeout) {
    var clientId = 'c9ccd3684988a7862a8542ae0000535e0fbd2d1c0ca35583af7ea4e784650a61';
    var clientSecret = 'bf00575b1ad252b514f14b2c6171fe650d474091daad5eb6fa890ef24d581f65';
    var authBaseUrl = 'https://auth.trakt.tv';

    function TraktLogin($scope) {
      this.$scope = $scope;
      this.pollPromise = null;
      this.expiresAt = null;

      var self = this;

      $scope.$on('reset', function() {
        self.reset();
      });

      $scope.deviceLogin = function() {
        return self.deviceLogin();
      };

      $scope.cancelDeviceLogin = function() {
        self.reset();
        $scope.cancelled();
      };

      $scope.$on('$destroy', function() {
        self.cancelPolling();
      });
    }

    TraktLogin.prototype.appendMessage = function(type, content) {
      this.$scope.messages.push({type: type, content: content});
    };

    TraktLogin.prototype.cancelPolling = function() {
      if(this.pollPromise !== null) {
        $timeout.cancel(this.pollPromise);
        this.pollPromise = null;
      }
    };

    TraktLogin.prototype.reset = function() {
      this.cancelPolling();
      this.expiresAt = null;
      this.$scope.messages = [];
      this.$scope.device = null;
      this.$scope.isPolling = false;
    };

    TraktLogin.prototype.deviceLogin = function() {
      var $scope = this.$scope;
      var self = this;

      this.reset();

      return $http({
        method: 'POST',
        url: authBaseUrl + '/oauth/device/code',
        headers: {
          'Content-Type': 'application/json',
          'trakt-api-version': '2',
          'trakt-api-key': clientId
        },
        data: {client_id: clientId}
      }).then(function(response) {
        var device = response.data;

        if(!Utils.isDefined(device.device_code) ||
           !Utils.isDefined(device.user_code) ||
           !Utils.isDefined(device.verification_url) ||
           !Utils.isDefined(device.expires_in) ||
           !Utils.isDefined(device.interval)) {
          self.appendMessage('error', 'Trakt returned an invalid device authorization response');
          return $q.reject(device);
        }

        $scope.device = device;
        $scope.pin.code = device.user_code;
        $scope.isPolling = true;
        self.expiresAt = new Date().getTime() + (device.expires_in * 1000);
        self.schedulePoll(device.interval);
        return device;
      }, function(error) {
        self.handleError(error.data, error.status, 'Unable to start Trakt authentication');
        return $q.reject(error);
      });
    };

    TraktLogin.prototype.schedulePoll = function(interval) {
      var self = this;

      this.cancelPolling();
      this.pollPromise = $timeout(function() {
        self.pollPromise = null;
        self.poll(interval);
      }, interval * 1000);
    };

    TraktLogin.prototype.poll = function(interval) {
      var $scope = this.$scope;
      var self = this;

      if(new Date().getTime() >= this.expiresAt) {
        $scope.isPolling = false;
        this.appendMessage('error', 'The Trakt activation code has expired. Please try again.');
        return;
      }

      $http({
        method: 'POST',
        url: authBaseUrl + '/oauth/device/token',
        headers: {
          'Content-Type': 'application/json',
          'trakt-api-version': '2',
          'trakt-api-key': clientId
        },
        data: {
          code: $scope.device.device_code,
          client_id: clientId,
          client_secret: clientSecret
        }
      }).then(function(response) {
        self.retrieveSettings(response.data);
      }, function(error) {
        if(error.status === 400) {
          self.schedulePoll(interval);
          return;
        }
        if(error.status === 429) {
          self.schedulePoll(interval + 5);
          return;
        }

        $scope.isPolling = false;
        self.handleDeviceError(error.status);
      });
    };

    TraktLogin.prototype.retrieveSettings = function(authorization) {
      var $scope = this.$scope;
      var self = this;

      return $http({
        method: 'GET',
        url: 'https://api.trakt.tv/users/settings',
        headers: {
          'Content-Type': 'application/json',
          'trakt-api-version': '2',
          'trakt-api-key': clientId,
          'Authorization': 'Bearer ' + authorization.access_token
        }
      }).then(function(response) {
        $scope.isPolling = false;
        $scope.pinAuthenticated({
          authorization: authorization,
          credentials: $scope.pin,
          settings: response.data
        });
      }, function(error) {
        $scope.isPolling = false;
        self.handleError(error.data, error.status, 'Unable to retrieve account details');
        return $q.reject(error);
      });
    };

    TraktLogin.prototype.handleDeviceError = function(status) {
      var messages = {
        404: 'The Trakt activation code is invalid. Please try again.',
        409: 'This Trakt activation code has already been used. Please try again.',
        410: 'The Trakt activation code has expired. Please try again.',
        418: 'Trakt access was denied.'
      };

      this.appendMessage('error', messages[status] ||
        'Unable to complete Trakt authentication (HTTP ' + status + ')');
    };

    TraktLogin.prototype.handleError = function(data, status, fallback) {
      var content = fallback;

      if(Utils.isDefined(data) && Utils.isDefined(data.error_description)) {
        content = data.error_description;
      } else if(Utils.isDefined(data) && Utils.isDefined(data.error)) {
        content = data.error;
      } else if(Utils.isDefined(status)) {
        content += ' (HTTP ' + status + ')';
      }

      this.appendMessage('error', content);
    };

    return {
      restrict: 'E',
      scope: {
        buttonSize: '@coButtonSize',
        isCancelEnabled: '=coCancelEnabled',
        cancelled: '=coCancelled',
        basic: '=coBasic',
        basicAuthenticated: '&coBasicAuthenticated',
        pin: '=coPin',
        pinAuthenticated: '&coPinAuthenticated'
      },
      templateUrl: 'directives/trakt/login.html',

      controller: function($scope) {
        if(typeof $scope.buttonSize === 'undefined') {
          $scope.buttonSize = 'small';
        }
        if(typeof $scope.pin === 'undefined') {
          $scope.pin = {code: null};
        }

        $scope.messages = [];
        $scope.device = null;
        $scope.isPolling = false;
        new TraktLogin($scope);
      }
    };
  });
