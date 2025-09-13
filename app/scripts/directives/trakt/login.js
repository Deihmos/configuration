'use strict';

angular.module('configurationApp')
  .directive('coTraktLogin', function(Utils, $http, $q) {
    var tr = new trakt.Client(
      'c9ccd3684988a7862a8542ae0000535e0fbd2d1c0ca35583af7ea4e784650a61',
      'bf00575b1ad252b514f14b2c6171fe650d474091daad5eb6fa890ef24d581f65'
    );

    function TraktLogin($scope) {
      this.$scope = $scope;

      // Bind scope functions
      var self = this;

      $scope.$on('reset', function() {
        self.reset();
      });

      $scope.basicLogin = function() {
        return self.basicLogin();
      };

      $scope.pinLogin = function() {
        return self.pinLogin();
      };

      $scope.switch = function(method) {
        $scope.messages = [];
        $scope.method = method;
      };
    }

    TraktLogin.prototype.appendMessage = function(type, content) {
      var $scope = this.$scope;

      $scope.messages.push({
        type: type,
        content: content
      });
    };

    TraktLogin.prototype.reset = function() {
      var $scope = this.$scope;

      // Reset state
      $scope.messages = [];
      $scope.method = 'pin';
    };

    TraktLogin.prototype.basicLogin = function() {
      var $scope = this.$scope;

      // Reset messages
      $scope.messages = [];

      // Fire callback
      $scope.basicAuthenticated({
        credentials: $scope.basic
      });

      return $q.resolve();
    };

    TraktLogin.prototype.pinLogin = function() {
      var $scope = this.$scope;
      var self = this;

      // Reset messages
      $scope.messages = [];

      // Direct HTTP request to Trakt API instead of using trakt.js library
      var tokenRequest = {
        method: 'POST',
        url: 'https://api.trakt.tv/oauth/token',
        headers: {
          'Content-Type': 'application/json',
          'trakt-api-version': '2',
          'trakt-api-key': 'c9ccd3684988a7862a8542ae0000535e0fbd2d1c0ca35583af7ea4e784650a61'
        },
        data: {
          code: $scope.pin.code,
          client_id: 'c9ccd3684988a7862a8542ae0000535e0fbd2d1c0ca35583af7ea4e784650a61',
          client_secret: 'bf00575b1ad252b514f14b2c6171fe650d474091daad5eb6fa890ef24d581f65',
          redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
          grant_type: 'authorization_code'
        }
      };

      return $http(tokenRequest).then(function(response) {
        var authorization = response.data;

        // Request account details
        var settingsRequest = {
          method: 'GET',
          url: 'https://api.trakt.tv/users/settings',
          headers: {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': 'c9ccd3684988a7862a8542ae0000535e0fbd2d1c0ca35583af7ea4e784650a61',
            'Authorization': 'Bearer ' + authorization.access_token
          }
        };

        return $http(settingsRequest).then(function(settingsResponse) {
          // the $http call automatically does this digest cycle when the promise gets resolved or rejected. No need to trigger $apply manually
          //$scope.$apply(function() {
            // Fire callback
            $scope.pinAuthenticated({
              authorization: authorization,
              credentials: $scope.pin,
              settings: settingsResponse.data,
            });
          //});
        }, function(error) {
          //$scope.$apply(function() {
            self.handleError(error.data, error.status, 'Unable to retrieve account details');
          //});

          return $q.reject(error.data, error.status);
        });
      }, function(error) {
        //$scope.$apply(function() {
          self.handleError(error.data, error.status, 'Unable to retrieve token');
        //});

        return $q.reject(error.data, error.status);
      });
    };

    TraktLogin.prototype.handleError = function(data, status, fallback) {
      var content = this.getError(data, status, fallback);

      // Update messages
      this.appendMessage('error', content);
    };

    TraktLogin.prototype.getError = function(data, status, fallback) {
      if(Utils.isDefined(data)) {
        // Retrieve error message from `data`
        if(Utils.isDefined(data.error) && data.error === 'invalid_grant') {
          return 'Invalid authentication pin provided';
        }

        if(Utils.isDefined(data.error_description)) {
          return data.error_description;
        }

        if(Utils.isDefined(data.error)) {
          return data.error;
        }
      }

      if(Utils.isDefined(status)) {
        return 'HTTP Error: ' + status;
      }

      // Fallback to generic message
      return fallback;
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
        // Set parameter defaults
        if(typeof $scope.buttonSize === 'undefined') {
          $scope.buttonSize = 'small';
        }

        if(typeof $scope.basic === 'undefined') {
          $scope.basic = {
            username: null,
            password: null
          };
        }

        if(typeof $scope.pin === 'undefined') {
          $scope.pin = {
            code: null
          };
        }

        // Set initial scope values
        $scope.messages = [];
        $scope.method = 'pin';

        // Construct main controller
        var main = new TraktLogin($scope);
      }
    };
  });
