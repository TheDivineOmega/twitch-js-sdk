(function() {
  var $ = window.jQuery || window.Zepto,
  requestTimeout = 5000;


  var Twitch = {
    baseUrl: 'http://beta.twitch.tv/kraken/',
    _config: {},
    extend: function(src) {
      $.extend(Twitch, src);
    }
  };

  // Make requests to the TwitchTV api. This is
  // a low-level interface--most clients are better
  // served by using a related high-level function
  Twitch.request = function(options, callback) {
    params = options.params || {};
    var status = Twitch.getStatus(),
      url = Twitch.baseUrl + options.method;

    if (status.authenticated) {
      params.oauth_token = Twitch._config.session.token;
    }

    $.ajax({
      url: url + '?' + $.param(params),
      dataType: 'jsonp',
      timeout : requestTimeout
    })
    .done(function(data) {
      console.log('suvvess');
      console.log(data);
      callback(null, data);
    })
    .fail(function(something, s2) {
      // forced fail by request timeout; we have no
      // way of knowing the actual error with json-p
      callback(true, null);
    });
  };

  Twitch.log = function(message) {
    if (window.console) {
      console.log.apply(console, arguments);
    }
  };

  window.Twitch = Twitch;
})();
(function() {
  // From remy's DOM storage polyfill
  // https://gist.github.com/350433

  var store = window.sessionStorage;

  if (!store) {
    (function () {
      var Storage = function (type) {
        function createCookie(name, value, days) {
          var date, expires;

          if (days) {
            date = new Date();
            date.setTime(date.getTime()+(days*24*60*60*1000));
            expires = "; expires="+date.toGMTString();
          } else {
            expires = "";
          }
          document.cookie = name+"="+value+expires+"; path=/";
        }

        function readCookie(name) {
          var nameEQ = name + "=",
              ca = document.cookie.split(';'),
              i, c;

          for (i=0; i < ca.length; i++) {
            c = ca[i];
            while (c.charAt(0)==' ') {
              c = c.substring(1,c.length);
            }

            if (c.indexOf(nameEQ) === 0) {
              return c.substring(nameEQ.length,c.length);
            }
          }
          return null;
        }
        
        function setData(data) {
          data = JSON.stringify(data);
          if (type == 'session') {
            window.name = data;
          } else {
            createCookie('localStorage', data, 365);
          }
        }
        
        function clearData() {
          if (type == 'session') {
            window.name = '';
          } else {
            createCookie('localStorage', '', 365);
          }
        }
        
        function getData() {
          var data = type == 'session' ? window.name : readCookie('localStorage');
          return data ? JSON.parse(data) : {};
        }

        // initialise if there's already data
        var data = getData();

        return {
          length: 0,
          clear: function () {
            data = {};
            this.length = 0;
            clearData();
          },
          getItem: function (key) {
            return data[key] === undefined ? null : data[key];
          },
          key: function (i) {
            // not perfect, but works
            var ctr = 0;
            for (var k in data) {
              if (ctr == i) {
                return k;
              } else {
                ctr++;
              }
            }
            return null;
          },
          removeItem: function (key) {
            delete data[key];
            this.length--;
            setData(data);
          },
          setItem: function (key, value) {
            data[key] = value+''; // forces the value to a string
            this.length++;
            setData(data);
          }
        };
      };

      store = new Storage('session');
    })();
  }

  Twitch.extend({
    _storage: store
  });

})();(function() {

  // Initialize the library
  // Accepts an options object specifying
  // your app's client id, recieved after
  // app creation on TwitchTV.
  //
  // Typical initialization:
  // <script>
  // Twitch.init({
  //   clientId: YOUR_CLIENT_ID
  // }, function() {
  //   console.log('the library is now loaded')
  // });
  // </script>
  var init = function(options, callback) {
    if (!options.clientId) {
      throw new Error('client id not specified');
    }

    Twitch._config.clientId = options.clientId;
    Twitch._initSession();

    if (typeof callback === 'function') {
      callback(null);
    }
  };

  Twitch.extend({
    init: init
  });
})();(function() {
  var parseFragment = function(hash) {
    var match,
      session;

    hash = hash || document.location.hash;

    var hashMatch = function(expr) {
      var match = hash.match(expr);
      return match ? match[1] : null;
    };

    session = {
      token: hashMatch(/access_token=(\w+)/),
      scope: hashMatch(/scope=([\w+]+)/) ? hashMatch(/scope=([\w+]+)/).split('+') : null,
      state: hashMatch(/state=(\w+)/),
      error: hashMatch(/error=(\w+)/),
      errorDescription: hashMatch(/error_description=(\w+)/)
    };

    return session;
  };

  var getStatus = function() {
    // TODO: force update parameter
    return {
      authenticated: !!Twitch._config.session.token,
      token: Twitch._config.session.token,
      scope: Twitch._config.session.scope,
      error: Twitch._config.session.error,
      errorDescription: Twitch._config.session.errorDescription
    };
  };

  // Login and redirect back to current page with an access token
  // The popup parameter can be used to authorize users without
  // leaving your page, as described in http://stackoverflow.com/a/3602045/100296
  // TODO: description about setting URI
  // Usage:
  // Twitch.login({
  //   redirect_uri: 'http://myappurl',
  //   popup: false,
  //   scope: ['user_read', 'channel_read']
  // });
  var login = function(options) {
    if (!options.scope) {
      throw new Error('Must specify list of requested scopes');
    }
    var params = {
      response_type: 'token',
      client_id: Twitch._config.clientId,
      redirect_uri: options.redirect_uri || window.location.href,
      scope: options.scope.join(' ')
    };

    if (!params.client_id) {
      throw new Error('You must call init before login');
    }
    
    var url = Twitch.baseUrl + 'oauth2/authorize?' + $.param(params);

    if (options.popup) {
      Twitch._config.loginPopup = window.open(url,
                          "Login with TwitchTV",
                          "height=450,width=680,resizable=yes,status=yes");
    } else {
      window.location = url;
    }
  };

  // Retrieve sessions from persistent storage and
  // persist new sessions.
  var initSession = function() {
    var storedSession,
      sessionKey = 'twitch_oauth_session';

    Twitch._config.session = {};
    // Retrieve sessions from persistent storage and
    // persist new sessions.
    if (window.JSON) {
      storedSession = Twitch._storage.getItem(sessionKey);
      if (storedSession) {
        try {
          Twitch._config.session = JSON.parse(storedSession);
        } catch (e) {
          //
        }
      }
    }

    // overwrite with new params if page has them
    if (document.location.hash.match(/access_token=(\w+)/)) {
      Twitch._config.session = parseFragment();

      if (window.JSON) {
        Twitch._storage.setItem(sessionKey, JSON.stringify(Twitch._config.session));
      }
    }
  };

  Twitch.extend({
    _initSession: initSession,
    getStatus: getStatus,
    login: login
  });
})();