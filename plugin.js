/**
 * Plugin.js file, set configs, routes, hooks and events here
 *
 * see http://wejs.org/docs/we/extend.plugin
 */
module.exports = function loadCFCPlugin(projectPath, Plugin) {
  const plugin = new Plugin(__dirname);
  // set plugin configs
  plugin.setConfigs({
    forms: {
      'cfcertification-template': __dirname + '/server/forms/cfcertification-template.json'
    },
    cfcertification: {
      names: {
        cfregistrationtype: 'Certificamos que {{data.fullName}}, participou do {{event.title}}, '+
          'no período de {{startDate}} a {{endDate}} ',
        'cfsession_subscribers': '',
        // 'cfsession_speakers': ''
      },
      texts: {
        cfregistrationtype: 'Certificamos que {{data.fullName}}, participou do {{event.title}} '+
          'no período de {{startDate}} a {{endDate}} ',
        'cfsession_subscribers': 'Certificamos que {{data.fullName}}, participou da atividade {{cfsession.title}} '+
          'no evento {{event.title}} '+
          'no período de {{startDate}} a {{endDate}} ',
        // 'cfsession_speakers': 'Certificamos que {{data.fullName}}, '+
        //   'participou como palestrante da atividade {{cfsession.title}} '+
        //   'no evento {{event.title}} '+
        //   'no período de {{startDate}} a {{endDate}} '
      }
    }
  });

  plugin.router.breadcrumb.add('cfcertificationAdmin', function cfcertificationAdmin(req, res, next) {
    if (!res.locals.event) return next();

      res.locals.breadcrumb = '<ol class="breadcrumb">'+
        '<li><a href="/">'+res.locals.__('Home')+'</a></li>'+
        '<li><a href="/event">'+res.locals.__('event.find')+'</a></li>'+
        '<li><a href="/event/'+res.locals.event.id+'">'+
          req.we.utils.string(res.locals.event.title || '').truncate(25).s+
        '</a></li>'+
        '<li><a href="/event/'+res.locals.event.id+'/admin">'+res.locals.__('event_admin')+'</a></li>'+
        '<li><a href="/event/'+req.params.eventId+'/admin/cfregistrationtype">'+
          res.locals.__('cfregistrationtype.find')+
        '</a></li>'+
        '<li class="active">#'+req.params.cfregistrationtypeId+'</li>'+
      '</ol>';

      next();
    }
  );

  // set plugin routes
  plugin.setRoutes({
    'get /event/:eventId([0-9]+)/admin/cfregistrationtype/:cfregistrationtypeId([0-9]+)/template': {
      name          : 'cfcertification.updateCFRTypeTemplate',
      layoutName    : 'eventAdmin',
      controller    : 'cfcertification',
      action        : 'updateCFRTypeTemplate',
      model         : 'certification-template',
      permission    : 'manage_event',
      titleHandler  : 'i18n',
      titleI18n     : 'cfcertification.template',
      breadcrumbHandler: 'cfcertificationAdmin',
      template      : 'cfcertification/updateTemplate'
    },

    'post /event/:eventId([0-9]+)/admin/cfregistrationtype/:cfregistrationtypeId([0-9]+)/template': {
      layoutName    : 'eventAdmin',
      controller    : 'cfcertification',
      action        : 'updateCFRTypeTemplate',
      model         : 'certification-template',
      permission    : 'manage_event',
      breadcrumbHandler: 'cfcertificationAdmin',
      template      : 'cfcertification/updateTemplate'
    },

    'get /event/:eventId([0-9]+)/admin/cfregistrationtype/:cfregistrationtypeId([0-9]+)/template/preview.pdf': {
      name          : 'cfcertification.previewCFRTypeTemplate',
      layoutName    : 'eventAdmin',
      controller    : 'cfcertification',
      action        : 'previewCFRTypeTemplate',
      model         : 'certification-template',
      permission    : 'manage_event'
    },

    'get /event/:eventId([0-9]+)/admin/cfregistrationtype/:cfregistrationtypeId([0-9]+)/template/generate': {
      name          : 'cfcertification.generateAllCFRTypeCertifications',
      layoutName    : 'eventAdmin',
      controller    : 'cfcertification',
      action        : 'generateAllCFRTypeCertifications',
      model         : 'certification-template',
      permission    : 'manage_event'
    },

    'get /event/:eventId([0-9]+)/admin/certification': {
      name          : 'eventCertification.find',
      layoutName    : 'eventAdmin',
      controller    : 'cfcertification',
      action        : 'findAllCertifications',
      model         : 'certification',
      permission    : 'manage_event',
      template      : 'cfcertification/findAllCertifications',
      titleHandler(req, res, next) {
        req.title = 'Templates de certificados gerados';
        res.locals.title = req.title;
        next();
      }
    }
  });

  /**
   * Generate all avaible certifications for one event
   * @param  {Object}   event event record
   * @param  {Object}   we    we.js
   * @param  {Function} done  callback
   */
  plugin.generateEventCertifications = function (event, we, done) {

    we.utils.async.series([
      function generateCFRTypeCertificationsOnCron(done) {
        we.db.models.cfregistrationtype
        .findAll()
        .then(function afterFindCFRTypes(cfrs) {
          we.utils.async.eachSeries(cfrs, function onEachCFRType(cfr, done) {
            plugin.generateCertificatiosForCFRType(we, event, cfr, done);
          }, done);
        })
        .catch(done);
      }
    ], done);
  }

  /**
   * GenerateEventCertifications
   * Certification generator handlers
   * @type {Object}
   */
  plugin.generateCertificatiosForCFRType = function (we, e, cfrt, done) {
    let tpl, cToCreate = [];

    let identifier = 'event-'+e.id+'-cfregistrationtype-'+cfrt.id;

    we.utils.async.series([
      function loadCertificationTemplate(done) {
        we.db.models['certification-template']
        .findOne({
          where: {
            identifier: identifier,
            published: true
          }
        })
        .then(function (r) {
          tpl = r;
          done();
        })
        .catch(done);
      },
      function loadCFR(done) {
        if (!tpl) return done();

        let startDate = we.utils.moment(e.eventStartDate).format('L');
        let endDate = we.utils.moment(e.eventEndDate).format('L');

        let sql = 'SELECT cfr.id AS id, cfr.userId AS userId, users.fullName, users.displayName, users.email '+
          'FROM cfregistrations AS cfr '+
          'LEFT JOIN  users ON users.id=cfr.userId '+
          'LEFT JOIN certification AS certifications ON certifications.identifier="'+identifier+
              '" AND certifications.userId=cfr.userId '+
          'WHERE cfr.eventId="'+e.id+'" '+
            ' AND cfr.cfregistrationtypeId='+cfrt.id+
            ' AND cfr.present=true ' +
            ' AND certifications.id IS NULL ';

        let textFN = we.hbs.compile(tpl.text);

        we.db.defaultConnection
        .query(sql)
        .spread(function (r) {
          if (!r || !r) return done();

          cToCreate = cToCreate.concat(r.map( (i)=> {
            // use displayName if fullName not is set
            if (!i.fullName) i.fullName = i.displayName;
            // skip if dont have userName
            if (!i.fullName && !i.displayName) return null;

            return {
              name: we.i18n.__('cfcertification.cfregitration.name', {
                event: e
              }),
              text: textFN({
                event: e,
                cfregistration: i,
                cfregistrationtype: cfrt,
                data: i,
                startDate: startDate,
                endDate: endDate
              }),
              identifier: identifier,
              userId: i.userId,
              templateId: tpl.id
            };
          }));

          done();
        })
        .catch(done);
      },
      function deleteOldCertifications(done) {
        we.db.models.certification
        .destroy({
          where: {
            [we.Op.or]: cToCreate.map( (c)=> {
              return {
                identifier: c.identifier,
                userId: c.userId,
                templateId: c.templateId
              };
            })
          }
        })
        .then( ()=> {
          done();
        })
        .catch(done);
      },

      function createCertifications(done) {
        if (!cToCreate) return done();

        we.db.models.certification
        .bulkCreate(cToCreate)
        .then(function () {
          if (cToCreate && cToCreate.length) {
            we.log.info('Event:id:'+e.id+': registration certifications: '+cToCreate.length+ ' identifier:'+identifier);
          }

          done(null, cToCreate);
        })
        .catch(done);
      }
    ], function (err) {
      if (err) {
        we.log.error('Error in generate user registration certifications: ', err);
      }
      return done();
    });
  }

  return plugin;
};