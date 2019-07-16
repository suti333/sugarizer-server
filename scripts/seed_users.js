// Script to import users from csv

// Read the name of the file
var filename = process.argv.slice(2)[0];
if (filename) {
    console.log("File: " + filename);
} else {
    console.log('Filename not specified');
    process.exit(-1);
}

// Import csv-parser module
var csv = require('csv-parser');

// Import csv-writer module and create CSV writer
var csvWriter = require('csv-writer');
var createCsvWriter = csvWriter.createObjectCsvWriter;

// Import fs module
var fs = require('fs');

// Import ini module to parse '.ini' files
var ini = require('ini');

// Import request library to make requests over the network
var request = require('request');

// Import common helper
var common = require('../dashboard/helper/common');

// Import xocolors helper
var xocolors = require('../dashboard/helper/xocolors')();

// Import regexvalidate helper
var regexValidate = require('../dashboard/helper/regexValidate');

// Initialize settings for .ini file
var settings;

// Read settings from .ini file
var env = (process.env.NODE_ENV ? process.env.NODE_ENV : 'sugarizer');
var confFile = "./env/" + env + '.ini';
fs.open(confFile, 'r', function(err) {
    if (err) {
      if (err.code === 'ENOENT') {
        console.log("Cannot load settings file '" + confFile + "', error code "+err.code);
        process.exit(-1);
      }
    }

    // Assign configuration data to settings
    settings = ini.parse(fs.readFileSync(confFile, 'utf-8'));

    // Initialize common module with settings
    common.init(settings);
});

// Define user with parameterized constructor
class User {
    constructor(name, type, language, color, password, classroom, comment) {
        this.name = name;
        this.type = type;
        this.language = language;
        this.color = color;
        this.password = password;
        this.classroom = classroom;
        this.comment = comment ? comment : "";
        this.status = 0;
        this._id = "";
    }
}

// Initialize the array that will contains all the users read from CSV
var AdminsStudents = [];
var Teachers = [];
var InvalidUsers = [];

// Trim and lowercase string
function cleanString(string) {
    if (!string) return;
    string = string.trim();
    string = string.toLowerCase();
    return string;
}

// Get random color from xocolors and generate color string
function getRandomColorString() {
    var randomColor = xocolors[Math.floor(Math.random()*xocolors.length)];
    randomColor = JSON.stringify(randomColor);
    return randomColor;
}

// Validate color string
function isValidColor(color) {
    // Check if valid JSON
    try {
        color = JSON.parse(color);
    } catch (e) {
        return false;
    }

    // Check if property 'stroke' and 'fill' exists
    if (!color.stroke || !color.fill) return false;

    // Look for the color in xocolors
    for (var i=0; i<xocolors.length; i++) {
        if (xocolors[i].stroke == color.stroke && xocolors[i].fill == color.fill) {
            return true;
        }
    }
    return false;
}

// Validate language
function isValidLanguage(lang) {
    var sugarizerLang = ["en", "es", "fr", "de", "pt", "ar", "ja", "pl", "ibo", "yor"];
    if(sugarizerLang.indexOf(lang) == -1) return false;
    else return true;
}

// Validate user role
function isValidType(type) {
    var roles = ["admin", "student", "teacher"];
    if (roles.indexOf(type) == -1) return false;
    else return true;
}

// Generate random password
function generatePassword(length) {
    var password = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXabcdefghijklmnopqrstuvwxyz0123456789"; // All alphanumeric characters except 'Y' and 'Z'

    for (var i = 0; i < length; i++)
        password += possible.charAt(Math.floor(Math.random() * possible.length));

    return password;
}

// Validate data row
function validateUserRow(user, index) {
    user.comment = "";

    if (!user.name || !regexValidate("user").test(user.name)) {
        console.log("Row: " + (index + 1) + " -> Username is invalid. Skipping... ");
        return;
    }

    var log = {
        info: "Row: " + (index + 1) + " -> User: " + user.name,
        status: false,
        addInfo: function(info) {
            this.status = true;
            this.info += info;
        },
        print: function() {
            if(this.status) console.log(this.info);
        }
    };

    user.type = cleanString(user.type);
    if (!isValidType(user.type)) {
        user.type = "student";
    }

    user.language = cleanString(user.language);
    if (!isValidLanguage(user.language)) {
        user.language = "en";
    }

    if (!isValidColor(user.color)) {
        user.color = getRandomColorString();
    }

    var minPass = (settings && settings.security && parseInt(settings.security.min_password_size)) ? parseInt(settings.security.min_password_size) : 4;
    if (!user.password || typeof user.password != "string" || user.password.length < minPass || !regexValidate("pass").test(user.password)) {
        user.password = generatePassword(minPass);
        log.addInfo(" -- Password invalid (random password)");
        user.comment += "Given password was invalid (Generated random password). ";
    }

    user.classroom = user.classroom ? user.classroom.trim() : "";
    user.classroom = user.classroom.split(',');
    
    var validClassrooms = [];
	if (user.classroom && user.classroom.length > 0) {
		for (var i=0; i<user.classroom.length; i++) {
			var thisClassroom = user.classroom[i] ? user.classroom[i].trim() : "";
			if (thisClassroom && (typeof thisClassroom != "string" || !regexValidate("user").test(thisClassroom))) {
                log.addInfo(" -- Classroom name " + JSON.stringify(thisClassroom) + " was Invalid (classroom dropped)");
				user.comment += "Classroom name " + JSON.stringify(thisClassroom) + " was invalid (Classroom dropped). ";
			} else if (thisClassroom) {
				validClassrooms.push(thisClassroom);
			}
		}
	}
    user.classroom = validClassrooms;

    log.print();
    return user;
}

// Function to stringift user class object
function stringifyUser(user) {
    if (user.type == "teacher") {
        var classrooms = [];
        for (var i=0; i < user.classroom.length; i++) {
            if (Classrooms[user.classroom[i]] && Classrooms[user.classroom[i]].data && Classrooms[user.classroom[i]].data._id && classrooms.indexOf(Classrooms[user.classroom[i]].data._id) == -1) {
                classrooms.push(Classrooms[user.classroom[i]].data._id);
            }
        }
        classrooms = JSON.stringify(classrooms);
        return '{"name":"' + user.name + '", ' +
        '"color":' + user.color + ', ' +
        '"role":"' + user.type + '", ' +
        '"password":"' + user.password + '", ' +
        '"language":"' + user.language + '", ' +
        '"classrooms":' + classrooms + ', ' +
        '"options":{"sync":true, "stats":true}}';
    } else {
        return '{"name":"' + user.name + '", ' +
        '"color":' + user.color + ', ' +
        '"role":"' + user.type + '", ' +
        '"password":"' + user.password + '", ' +
        '"language":"' + user.language + '", ' +
        '"options":{"sync":true, "stats":true}}';
    }
}

// Initiate Master Admin
var masterAdmin = stringifyUser(new User('Master_Admin_' + (+new Date()).toString(), 'admin', 'en', getRandomColorString(), 'password'));

// Insert User
function insertUser(Users, i) {
    return new Promise(function(resolve, reject) {
        request({
            headers: {
                "content-type": "application/json",
                "x-access-token": masterAdmin.token,
                "x-key": masterAdmin.user._id
            },
            json: true,
            method: 'post',
            uri: common.getAPIUrl() + 'api/v1/users',
            body: {
                user: stringifyUser(Users[i])
            }
        }, function(error, response, body) {
            if (response.statusCode == 200) {
                Users[i].status = 1;
                Users[i]._id = body._id;
                resolve(body);
            } else {
                Users[i].comment += body.error;
                body.user = Users[i];
                reject(body);
            }
        });
    });
}

// Initiate Classrooms object
var Classrooms = {}; // Contains {classname{ students: [students_array], data: classroom_data }

function stringifyExistingClassroom(name) {
    var newStudents = Classrooms[name].students;
    var oldStudents = [];
    if (Classrooms[name].data && Classrooms[name].data.students && Classrooms[name].data.students.length > 0) {
        oldStudents = Classrooms[name].data.students;
    }
    var union = [...new Set([...newStudents, ...oldStudents])];
    var classroomData = {
        name: name,
        color: Classrooms[name].data.color,
        students: union
    };
    classroomData = JSON.stringify(classroomData);
    return classroomData;
}

function stringifyNewClassroom(name) {
    var students = JSON.stringify(Classrooms[name].students);
    return '{"name":"' + name + '","color":' + getRandomColorString() + ',"students":' + students + '}';
}

// Update classroom by ID
function updateClassroom(name) {
    return new Promise(function(resolve, reject) {
        request({
            headers: {
                "content-type": "application/json",
                "x-access-token": masterAdmin.token,
                "x-key": masterAdmin.user._id
            },
            json: true,
            method: 'put',
            uri: common.getAPIUrl() + 'api/v1/classrooms/' + Classrooms[name].data._id,
            body: {
                classroom: stringifyExistingClassroom(name)
            }
        }, function(error, response, body) {
            body.q = name;
            if (response.statusCode == 200) {
                resolve(body);
            } else {
                reject(body);
            }
        });
    });
}

// Insert Classroom
function insertClassroom(name) {
    return new Promise(function(resolve, reject) {
        request({
            headers: {
                "content-type": "application/json",
                "x-access-token": masterAdmin.token,
                "x-key": masterAdmin.user._id
            },
            json: true,
            method: 'post',
            uri: common.getAPIUrl() + 'api/v1/classrooms',
            body: {
                classroom: stringifyNewClassroom(name)
            }
        }, function(error, response, body) {
            body.q = name;
            if (response.statusCode == 200) {
                resolve(body);
            } else {
                reject(body);
            }
        });
    });
}

// Find Classroom
function findClassroom(name) {
    return new Promise(function(resolve, reject) {
        var query = {
            sort: '+name',
            q: name
        };
        request({
            headers: {
                "content-type": "application/json",
                "x-access-token": masterAdmin.token,
                "x-key": masterAdmin.user._id
            },
            json: true,
            method: 'GET',
            qs: query,
            uri: common.getAPIUrl() + 'api/v1/classrooms'
        }, function(error, response, body) {
            body.q = name;
            if (response.statusCode == 200) {
                resolve(body);
            } else {
                reject(body);
            }
        });
    });
}

// Create a list of all classrooms in Users
function getClassroomsNamesFromUsers(Users) {
    var classroomList = [];
    for (var i=0; i<Users.length; i++) {
        if (typeof Users[i].classroom == "object" && Users[i].classroom.length > 0) {
            for (var j=0; j<Users[i].classroom.length; j++) {
                if (classroomList.indexOf(Users[i].classroom[j]) == -1) {
                    classroomList.push(Users[i].classroom[j]);
                }
            }
        }
    }
    return classroomList;
}

// Function to generate CSV of users
function generateCSV(Users) {
    return new Promise(function(resolve, reject) {
        var csvWriter = createCsvWriter({
            path: "output.csv",
            header: [
                {id: 'name', title: 'name'},
                {id: 'type', title: 'type'},
                {id: 'language', title: 'language'},
                {id: 'color', title: 'color'},
                {id: 'password', title: 'password'},
                {id: 'classroom', title: 'classroom'},
                {id: 'status', title: 'status'},
                {id: 'comment', title: 'comment'}
            ]
        });
        csvWriter
        .writeRecords(Users)
        .then(function() {
            resolve("output.csv");
        }).catch(function(err) {
            reject(err);
        });
    });
}

// Function to delete Master Admin
function deleteMasterAdmin() {
    return new Promise(function(resolve, reject) {
        request({
            headers: {
                "content-type": "application/json",
                "x-access-token": masterAdmin.token,
                "x-key": masterAdmin.user._id
            },
            json: true,
            method: 'delete',
            uri: common.getAPIUrl() + 'api/v1/users/' + masterAdmin.user._id,
        }, function(error, response, body) {
            if (response.statusCode == 200) {
                resolve(body);
            } else {
                reject(body);
            }
        });
    });
}

// Finish classroom assignment and generate CSV and delete Master Admin
function returnResponse() {
    var allUsers = [...new Set([...AdminsStudents, ...Teachers, ...InvalidUsers])];
    Promise.all([generateCSV(allUsers), deleteMasterAdmin()]).then(function(values) {
        console.log('The CSV file written successfully. Filename: ' + values[0]);
        process.exit(0);
    }).catch(function(err) {
        console.log(err);
    });
}

// Find classrooms. Insert classroom if not found
function findOrCreateClassroom(classes) {
    var classroomProcessed = 0;
    for (var i=0; i < classes.length; i++) {
        findClassroom(classes[i]).then(function(res) {
            if (res && res.classrooms && res.classrooms.length > 0 && res.classrooms[0] && res.q == res.classrooms[0].name) {
                // Confirm Match
                Classrooms[res.q].data = res.classrooms[0];
                updateClassroom(res.q).then(function(res) {
                    classroomProcessed++;
                    if (res) {
                        Classrooms[res.q].data = res;
                    } else {
                        console.log("Error creating classroom");
                    }
                    if (classroomProcessed == classes.length) initTeacherAssignment();
                })
                .catch(function(err) {
                    classroomProcessed++;
                    console.log(err);
                    if (classroomProcessed == classes.length) initTeacherAssignment();
                });
            } else {
                // Create Classroom
                insertClassroom(res.q).then(function(res) {
                    classroomProcessed++;
                    if (res) {
                        Classrooms[res.q].data = res;
                    } else {
                        console.log("Error creating classroom");
                    }
                    if (classroomProcessed == classes.length) initTeacherAssignment();
                })
                .catch(function(err) {
                    classroomProcessed++;
                    console.log(err);
                    if (classroomProcessed == classes.length) initTeacherAssignment();
                });
            }
        })
        .catch(function(err) {
            classroomProcessed++;
            console.log(err);
            if (classroomProcessed == classes.length) initTeacherAssignment();
        });
    }
}

// Processed users for assignment into classrooms
function initClassroomAssignment() {
    var uniqueClassrooms = getClassroomsNamesFromUsers([...new Set([...AdminsStudents, ...Teachers])]);
    for (var i=0; i<uniqueClassrooms.length; i++) {
        Classrooms[uniqueClassrooms[i]] = {data: "", students: []};
    }
    for (var j=0; j<AdminsStudents.length; j++) {
        if (AdminsStudents[j].status && AdminsStudents[j].type == "student" && AdminsStudents[j]._id && typeof AdminsStudents[j].classroom == "object") {
            for (var k=0; k < AdminsStudents[j].classroom.length; k++) {
                if (AdminsStudents[j].classroom[k] && typeof AdminsStudents[j].classroom[k] == "string" && Classrooms[AdminsStudents[j].classroom[k]] && typeof Classrooms[AdminsStudents[j].classroom[k]].students == "object") {
                    // Push user into classroom
                    Classrooms[AdminsStudents[j].classroom[k]].students.push(AdminsStudents[j]._id);
                }
            }
        }
    }

    if (uniqueClassrooms.length > 0) findOrCreateClassroom(uniqueClassrooms);
    else initTeacherAssignment();
}

// Initiate Teacher Assignment
function initTeacherAssignment() {
    if (Teachers.length > 0) {
        var usersProcessed = 0;
        // Insert all teachers
        for (var i=0; i < Teachers.length; i++) {
            insertUser(Teachers, i).then(function() {
                usersProcessed++;
                if (usersProcessed == Teachers.length) returnResponse();
            }).catch(function() {
                usersProcessed++;
                if (usersProcessed == Teachers.length) returnResponse();
            });
        }
    } else {
        returnResponse();
    }
}

// Initiate seeding to DB
function initSeed() {
    // Create Master Admin
    request({
        headers: {
            "content-type": "application/json",
        },
        json: true,
        method: 'POST',
        uri: common.getAPIUrl() + 'auth/signup',
        body: {
            "user" : masterAdmin
        }
    }, function(error, response) {
        if (response && response.statusCode == 200) {
            // Master Admin created
            request({
                headers: {
                    "content-type": "application/json",
                },
                json: true,
                method: 'POST',
                uri: common.getAPIUrl() + 'auth/login',
                body: {
                    "user" : masterAdmin
                }
            }, function(error, response, body) {
                if (response.statusCode == 200) {
                    // Logged into Master Admin
                    masterAdmin = body;

                    var usersProcessed = 0;
                    // Insert all users
                    for (var i=0; i < AdminsStudents.length; i++) {
                        insertUser(AdminsStudents, i).then(function() {
                            usersProcessed++;
                            if (usersProcessed == AdminsStudents.length) initClassroomAssignment();
                        }).catch(function(err) {
                            if (err) console.log("Error inserting " + err.user.name + ": " + err.error);
                            usersProcessed++;
                            if (usersProcessed == AdminsStudents.length) initClassroomAssignment();
                        });
                    }
                    if (AdminsStudents.length == 0) {
                        initClassroomAssignment();
                    }
                } else {
                    console.log('Error logging into Master Admin');
                    process.exit(-1);
                }
            });
        } else if (!response) {
            console.log('Error: Cannot access sugarizer-server');
            process.exit(-1);
        } else {
            console.log('Error creating Master Admin');
            process.exit(-1);
        }
    });
}

// Reading and validating file

var dataIndex = 0;
// Read the CSV file
fs.createReadStream(filename)
    .on('error', function(err) {
        throw err;
    })
    .pipe(csv())
    .on('data', function(row) {
        dataIndex++;
        var validRow = validateUserRow(row, dataIndex);
        if (validRow) {
            if (validRow.type == "teacher") {
                Teachers.push(new User(validRow.name, validRow.type, validRow.language, validRow.color, validRow.password, validRow.classroom, validRow.comment));
            } else {
                AdminsStudents.push(new User(validRow.name, validRow.type, validRow.language, validRow.color, validRow.password, validRow.classroom, validRow.comment));
            }
        } else {
            InvalidUsers.push(new User(row.name, row.type, row.language, row.color, row.password, row.classroom, "Invalid Username"));
        }
    })
    .on('end', function() {
        // Finished processing CSV file
        var AllUsers = [...new Set([...AdminsStudents, ...Teachers])];
        if (AllUsers.length == 0) {
            console.log('Error: No users to insert');
            process.exit(-1);
        }
        initSeed();
    });
