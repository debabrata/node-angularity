'use strict';
/* globals cd, cp, mkdir, exec */

var fs          = require('fs'),
    path        = require('path'),
    gulp        = require('gulp'),
    ideTemplate = require('ide-template'),
    _           = require('lodash');

var config = require('../config/config');
var configDefaults = require('../config/configDefaults');

require('shelljs/global');

/**
 * Utility methods common to generator tasks.
 * @type Object
 */
var util = {};
var projects = [];

/**
 * Create a new project by name.
 * Warning this creates the project without prompt, currently its is only being used
 * by the ci for generating projects.
 * @param name
 */
util.generateProject = function (name) {
  var projects = util.listProjects();

  if (_.contains(projects, name)) {
    var generator = require('./generator');
    var project = generator.createProject(name);
    generator.currentProject = project;
    project.setProjectName(name);
    gulp.start(project.projectType);

  } else {
    console.error('There are no projects with name', name);
    console.log('The available projects are', projects);
  }
};

/**
 * The tools absolute template folder path for config files, ide settings etc...
 * @type {*|string}
 */
util.commonTemplatesPath = path.join(__dirname, 'templates');

/**
 * Using the util.defaultGlobalConfig() and template generate the global .angularity config file.
 *
 * @param override template context
 */
util.createAngularityGlobalConfig = function (override) {
  var configTemplatePath = path.join(util.commonTemplatesPath, '.angularity');
  var configTemplate = fs.readFileSync(configTemplatePath, 'utf8');
  var defaultContext = configDefaults.globalConfig;

  if (typeof override !== 'undefined') {
    defaultContext = _.merge(defaultContext, override);
  }

  var configFileContent;

  try {
    configFileContent = _.template(configTemplate, defaultContext)
  } catch (error) {
    console.error('createAngularityGlobalConfig()');
    throw error;
  }

  fs.writeFileSync(path.join(ideTemplate.util.HOME(), '.angularity'), configFileContent, 'utf8');
};

/**
 * Using the util.createAngularityProjectConfig() and template generate a project specific angularity.json config file.
 * @param destination
 * @param override
 */
util.createAngularityProjectConfig = function (destination, override) {
  var configTemplatePath = path.join(util.commonTemplatesPath, 'angularity.json');
  var configTemplate = fs.readFileSync(configTemplatePath, 'utf8');
  var defaultContext = configDefaults.projectConfig;

  if (typeof override !== 'undefined') {
    defaultContext = _.merge(defaultContext, override);
  }

  var configFileContent;

  try {
    configFileContent = _.template(configTemplate, defaultContext)
  } catch (error) {
    console.error('createAngularityProjectConfig()');
    throw error;
  }

  var configFileDestination = path.join(destination, 'angularity.json');
  fs.writeFileSync(configFileDestination, configFileContent, 'utf8');
};

/**
 * Basic check on a folder path if a generator project exists.
 * @param projectPath
 * @returns {*}
 */
util.validGeneratorProject = function (projectPath) {
  return fs.existsSync(path.join(projectPath, 'index.js'));
};

/**
 * List all the generator projects in the local ./lib/generator/projects folder.
 * @returns {Array}
 */
util.listProjects = function () {
  var projectsPath = path.join(__dirname, 'projects');
  var existingProjects = [];
  var projectsDirectory = fs.readdirSync(String(projectsPath));

  _.forEach(projectsDirectory, function (project) {
    if (util.validGeneratorProject(path.join(projectsPath, project))) {
      existingProjects.push(project);
    }
  });

  projects = existingProjects;
  return projects;
};

/**
 * Copy a directory recursively to a given destination.
 * @param source
 * @param destination
 * @param copyRootFolder {Boolean} if true do not copy the root folder of the source path,
 *                           instead just copy it's contents.
 */
util.cpR = function (source, destination, copyRootFolder) {
  copyRootFolder = copyRootFolder || false;

  if (!fs.existsSync(destination)) {
    mkdir('-p', destination);
  }

  if (copyRootFolder) {
    var originalCWD = process.cwd();
    cd(source);
    cp('-R', '.', destination);
    cd(String(originalCWD));
  } else {
    cp('-R', source, destination);
  }
};

/**
 * Basic npm install command to run the install programatically,
 * the current working directory of process will be unaltered.
 * @param destination
 */
util.npmInstall = function (destination) {
  var originalCWD = process.cwd();
  cd(destination);

  var npmInstallCode = exec('npm i').code;

  if (npmInstallCode > 0) {
    process.exit(npmInstallCode);
  }

  cd(String(originalCWD));
};

/**
 * Shortcut to check if a directory has an Angularity project at a specific directory.
 * Basic check only looks for the config file and some required folders.
 * @param directory
 * @returns {*}
 */
util.validateExistingProject = function (directory) {
  return (
  util.validateProjectDirectories(directory) &&
  util.validateConfigExists(directory)
  );
};

util.validateProjectDirectories = function (directory) {
  return (
  fs.existsSync(path.join(directory, 'src', 'css-lib')) &&
  fs.existsSync(path.join(directory, 'src', 'js-lib')) &&
  fs.existsSync(path.join(directory, 'src', 'target'))
  );
};

util.validateConfigExists = function (directory) {
  return (fs.existsSync(path.join(directory, 'angularity.json')));
};

/**
 * The main Generator Project template.
 * @param type
 * @constructor
 */
function GeneratorProject(type) {
  var projectTypePath = path.join(__dirname, 'projects', type);
  var defaultProjectName = 'angularity-project';

  if (!fs.existsSync(projectTypePath)) {
    console.error('Error there does not seem to be a project with the name', type);
  }

  return {
    /**
     * The project type is the folder name of the generator project.
     * Eg: es5-minimal
     */
    projectType    : type,
    /**
     * The absolute path to the generator project template.
     */
    projectTypePath: projectTypePath,
    /**
     * The project name used by the generator to populate the config files, destination etc.
     */
    projectName    : defaultProjectName,
    /**
     * The absolute path the the generator project's template folder.
     */
    templatePath   : path.join(__dirname, 'projects', type, 'template'),
    /**
     * The generator project's destination path.
     */
    destination    : path.join(String(process.cwd()), defaultProjectName),

    projectConfig: configDefaults.projectConfig,

    /**
     * Set the main project name and update the destination path.
     * @param name
     */
    setProjectName: function (name) {
      this.projectName = name;
      this.destination = path.join(String(process.cwd()), name);
    },

    /**
     * Based on the current GeneratorProject object,
     * recursively copy all the project's files to the project's destination.
     */
    copyProjectTemplateFiles: function () {
      util.cpR(this.templatePath, this.destination, true);
    },

    /**
     * Based on the current GeneratorProject object,
     * create an Angularity Project Config and determine the destination automatically.
     * @param override
     */
    createAngularityProjectConfig: function (override) {
      if (typeof override !== 'undefined') {
        this.projectConfig = _.merge(this.projectConfig, override);
      }
      util.createAngularityProjectConfig(this.destination, this.projectConfig);
    }
  };
}

/**
 * Require all the generator projects in the `./lib/generator/projects` folder.
 * This is used to populate the cli menu with the projects to generate.
 */
function requireProjects() {
  util.listProjects();

  _.forEach(projects, function (project) {
    var pathResolved = path.resolve(__dirname, '.' + path.sep, path.join('projects', project, 'index'));
    require(pathResolved);
  });
}

module.exports = {
  createProject  : function (type) {
    return new GeneratorProject(type);
  },
  currentProject : undefined,
  requireProjects: requireProjects,
  util           : util
};