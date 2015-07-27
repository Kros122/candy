import Promise from 'bluebird'
import Duoshuo from 'duoshuo'

export default function({ app, express, theme, Member }) {
  var Route = express.Router()
  var user = ctrlers.user
  var duoshuo = new Duoshuo(locals.site.duoshuo)

  // => /sign
  // PAGE: show sign in page.
  Route.get('/', (req, res, next) => {
    if (res.locals.user) 
      return res.redirect('/')

    theme.render('/sign')
      .then(done)
      .catch(next)

    function done(html) {
      res.send(html)
    }
  })

  // => /sign/in
  // PAGE: signin via duoshuo
  Route.get('/in', duoshuo.signin(), (req, res, next) => {
    if (!res.locals.duoshuo) 
      return next(new Error('多说登录失败'))

    var result = res.locals.duoshuo
    var isValidUser = !!(result.access_token && result.user_id)

    async.waterfall([
      // read a user by duoshuo.user_id
      function(callback) {
        Member.read(result.user_id, callback)
      },
      // check if a vaild exist user.
      function(exist, callback) {
        if (!exist) 
          return callback(null)

        req.session.user = exist
        return res.redirect('back')
      },
      // fetch new uses' infomation
      function(callback) {
        if (!isValidUser) 
          return countUser(null, callback)

        // if access_token vaild
        var ds = duoshuo.getClient(result.access_token)

        ds.userProfile({
          user_id: result.user_id
        }, function(err, body) {
          if (err) return countUser(null, callback)
          if (body.code !== 0) return countUser(null, callback)
          var userinfo = body.response
          if (!userinfo) return countUser(null, callback)
          return countUser(userinfo, callback)
        })
      },
      // born a user
      function(count, userinfo, callback) {
        var newbie = {};
        newbie.type = (count == 0) ? 'admin' : 'normal';

        if (isValidUser) {
          newbie.duoshuo = {}
          newbie.duoshuo.user_id = result.user_id
          newbie.duoshuo.access_token = result.access_token
        }

        if (userinfo) {
          newbie.nickname = userinfo.name
          newbie.url = userinfo.url
          newbie.avatar = userinfo.avatar_url
          newbie.email_notification = userinfo.email_notification

          if (userinfo.social_uid && userinfo.connected_services) {
            newbie.social_networks = mergeSameNetwork(userinfo.social_uid, userinfo.connected_services)
          }
        }

        Member.create(newbie, function(err, baby) {
          callback(err, count, baby)
        })
      }
    ], function(err, count, baby) {
      if (err) 
        return next(err)

      req.session.user = baby

      if (count == 0) 
        return res.redirect('/admin/')

      res.redirect('/member/' + req.session.user._id)
    })
  })
  
  // => /sign/out
  Route.get('/out', deps.middlewares.passport.signout)

  return Sign

  function mergeSameNetwork(social_uid, connected_services) {
    Object.keys(connected_services).forEach(function(item){
      if (!social_uid[item]) 
        return

      connected_services[item]['social_uid'] = social_uid[item]
    })

    return connected_services
  }

  function countUser(userinfo, callback) {
    return Member.count(function(err, counts) {
      return callback(err, counts, userinfo)
    })
  }
}
