// Sugarizer server

var express = require('express'),
	settings = require('./api/config/settings'),
	activities = require('./api/routes/activities'),
	journal = require('./api/routes/journal'),
	users = require('./api/routes/users'),
	auth = require('./api/routes/auth'),
	stats = require('./api/routes/stats'),
	validate = require('./api/middleware/validateRequest'),
	presence = require('./api/middleware/presence');

var app = express();

// Add headers
app.use(function(req, res, next) {

	// Website you wish to allow to connect
	res.setHeader('Access-Control-Allow-Origin', '*');

	// Request methods you wish to allow
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

	// Request headers you wish to allow
	res.setHeader('Access-Control-Allow-Headers', 'x-key,x-access-token');

	// Pass to next layer of middleware
	next();
});

app.configure(function() {

	//logger
	if (process.env.NODE_ENV !== 'test') {
		app.use(express.logger('dev'));
	}

	//body parser
	app.use(express.bodyParser());

	// header's fix
	app.use(function(req, res, next) {
		var _send = res.send;
		var sent = false;
		res.send = function(data) {
			if (sent) return;
			_send.bind(res)(data);
			sent = true;
		};
		next();
	});
});




//load conf file
var confFile = process.env.NODE_ENV;
var ini = settings.load(confFile);

//Only the requests that start with /api/v1/* will be checked for the token.
app.all('/api/v1/*', [validate]);

// Init modules
activities.load(ini);
journal.init(ini);
users.init(ini);
presence.init(ini);
stats.init(ini);

/*
 * Routes that can be accessed by any one
 */
app.post('/login', auth.login);
app.post('/signup', auth.signup);

// Register activities list API
app.get("/api/v1/activities", activities.findAll);
app.post("/api/v1/activities", activities.updateActivities);
app.get("/api/v1/activities/:id", activities.findById);

// Register users API
app.get("/api/v1/users", users.findAll);
app.get("/api/v1/users/:uid", users.findById);
app.post("/api/v1/users", users.addUser);
app.put("/api/v1/users/:uid", users.updateUser);
app.delete("/api/v1/users/:uid", users.removeUser);

// Register stats API
app.get("/api/v1/stats", stats.findAll);
app.post("/api/v1/stats", stats.addStats);
app.delete("/api/v1/stats", stats.deleteStats);

// Register journal API
app.get("/api/v1/journal", journal.findAll);
app.get("/api/v1/journal/:jid", journal.findJournalContent);
app.post("/api/v1/journal/:jid", journal.addEntryInJournal);
app.put("/api/v1/journal/:jid", journal.updateEntryInJournal);
app.delete("/api/v1/journal/:jid", journal.removeInJournal);

// If no route is matched by now, it must be a 404
app.use(function(req, res, next) {
	res.status(404);
	res.json({
		"status": 404,
		"message": "Route Not Found!",
		"url": req.protocol + '://' + req.get('host') + req.originalUrl
	});
	return;
});

// Start listening
app.listen(ini.web.port);
console.log("Sugarizer server listening on port " + ini.web.port + "...");

//export app for testing
module.exports = app;
