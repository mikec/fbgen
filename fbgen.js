function FBGen(options) {
  this.fbAppID = options.appID;
  this.fbAppSecret = options.appSecret;

  this.service = options.service;
  /* EXAMPLE:
    this.service = {
      get: function(url, success, error) {
        //implement
      },
      post: function(url, success, error) {
        //implement
      }
    }
  */
  if(!this.service) {
    throw new Error('"service" option is required');
  }
  if(!this.service.get) {
    throw new Error('your service must implement a "get" function');
  }
  if(!this.service.post) {
    throw new Error('your service must implement a "post" function');
  }

  var g = this.service.get;
  var p = this.service.post;

  this.service.get = function(url) {
    var def = Q.defer();
    g(url, function(resp) {
      def.resolve(resp);
    }, function(err) {
      def.reject(err);
    });
    return def.promise;
  }

  this.service.post = function(url) {
    var def = Q.defer();
    p(url, function(resp) {
      def.resolve(resp);
    }, function(err) {
      def.reject(err);
    });
    return def.promise;
  }

  this.users = [];
}

FBGen.prototype = {

  init: function(options) {
    if(!options) options = {};
    if(!options.numberOfUsers) options.numberOfUsers = 25;
    var $this = this;
    // get app access token
    return this.getAppAccessToken().then(function(d) {
      $this.appAccessToken = d.substr(d.indexOf('=')+1);
      // get existing users
      return $this.getExistingUsers();
    }).then(function(d) {
      if(options.forceCreate || d.data.length < options.numberOfUsers) {
        // delete and recreate all existing users
        return $this.deleteUsers(d.data).then(function() {
          return $this.createUsers(options.numberOfUsers);
        })
      } else {
        return Q.fcall(function() { return d.data; })
      }
    }).then(function(resp) {
      for(var i in resp) {
        var user = (resp[i].response ? resp[i].response : resp[i]);
        $this.users.push(user);
      }
      return Q.fcall(function() { return $this.users; });
    });
  },

  getAppAccessToken: function() {
    return this.service.get('https://graph.facebook.com/oauth/access_token?' +
       'client_id=' + this.fbAppID +
       '&client_secret=' + this.fbAppSecret +
       '&grant_type=client_credentials'
    );
  },

  changeUserName: function(user, newName) {
    return this.service.post('https://graph.facebook.com/' + user.id + 
      '?name=' + newName + 
      '&method=post&access_token=' + user.access_token
    );
  },

  addFriends: function(user, friendUsers) {
    var def = Q.defer();
    var numFriendsAdded = 0;
    var numFriendsConfirmed = 0;
    var $this = this;

    function confirmRequests() {
      for(var j in friendUsers) {
        $this.service.post('https://graph.facebook.com/' + friendUsers[j].id + 
          '/friends/' + user.id + 
          '?method=post&access_token=' + friendUsers[j].access_token
        ).then(function() {
          numFriendsConfirmed++;
          if(numFriendsConfirmed == friendUsers.length) {
            def.resolve(true);
          }
        }, 
        function(resp) { 
          def.reject(JSON.parse(resp));
        });
      }
    }

    for(var i in friendUsers) {
      this.service.post('https://graph.facebook.com/' + user.id + 
        '/friends/' + friendUsers[i].id + 
        '?method=post&access_token=' + user.access_token
      ).then(function() {
        numFriendsAdded++;
        if(numFriendsAdded == friendUsers.length) confirmRequests();
      }, 
      function(resp, something, something2, something3) { 
        if(JSON.parse(resp).error.code != 520 && // already a pending friend req 
           JSON.parse(resp).error.code != 522) // already friends with user  
        {      
          def.reject(JSON.parse(resp));
        } else {
          numFriendsAdded++;
          if(numFriendsAdded == friendUsers.length) confirmRequests();
        }
      });
    }
    return def.promise;
  },

  getExistingUsers: function() {
    return this.service.get('https://graph.facebook.com/' + this.fbAppID + '/accounts/test-users?access_token=' + this.appAccessToken);
  },

  deleteUsers: function(userData) {
    var def = Q.defer();

    var numResponses = 0;
    var errors = [];
    for(var i in userData) {
      var u = userData[i];
      this.service.get('https://graph.facebook.com/' + u.id + '?method=delete&access_token=' + u.access_token).then(function(resp) {
        numResponses++;
        if(numResponses == userData.length) {
          def.resolve({status:'deleteUsers complete', errors:errors});
        }
      }, function(err) {
        errors.push(err);
      });
    }
    return def.promise;
  },

  createUsers: function(numUsers) {
    var def = Q.defer();
    var numResponses = 0;
    var errors = [];
    for(var i = 0; i < numUsers; i++) {
      this.service.get('https://graph.facebook.com/' + this.fbAppID + '/accounts/test-users?' +
            'installed=true&locale=en_US&permissions=email' +
            '&method=post&access_token=' + this.appAccessToken).then(function(resp) {
              numResponses++;
              if(numResponses == numUsers) {
                def.resolve({status:'createUsers complete', errors:errors});
              }
            }, function(err) {
              errors.push(err);
            });
    }
    return def.promise;
  },

  getUser: function(userId) {
    return this.service.get('https://graph.facebook.com/' + userId);
  }

}

// if nodeJS, export
if(typeof module !== 'undefined' && module.exports) {
  module.exports = FBGen;
}


