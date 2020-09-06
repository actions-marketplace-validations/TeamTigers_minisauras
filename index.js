const core = require("@actions/core");
const github = require("@actions/github");
const path = require("path");
const fs = require("fs");
const glob = require("glob");
const csso = require("csso");
const { minify } = require("terser");

const { Octokit } = require("@octokit/core");
const { createPullRequest } = require("octokit-plugin-create-pull-request");
const MyOctokit = Octokit.plugin(createPullRequest);

(async function init() {
  try {
    let directory = core.getInput("directory");
    const token = process.env.GITHUB_TOKEN;

    if (token === undefined || token.length === 0) {
      throw new Error(`
        Token not found. Please, set a secret token in your repository. 
        To know more about creating tokens, visit: https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token
        To know more about setting up personal access token, visit: https://docs.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets
      `);
    }

    const currentBranch = github.context.ref.slice(11);
    if(currentBranch.startsWith('_minisauras_')){
      console.log(`Code has been minifed. Branch ${currentBranch} can be merged now.`);
      return;
    }

    const pluginOctokit = new MyOctokit({
      auth: token,
    });
    const context = github.context;
    const repoInfo = context.repo;

    if (
      directory == undefined ||
      directory == null ||
      directory.startsWith(".")
    )
      directory = "";

    const pattern = `${directory}**/*.{css,js}`;
    const options = {
      dot: true,
      ignore: ["node_modules/**/*"],
    };

    const newBranchName = '_minisauras_' + Math.random().toString(36).slice(2);


    glob(pattern, options, function (er, files) {
      if (er) throw new Error("File not found");
      let final = [];

      files.forEach(function (file) {
        Promise.all([readAndMinify(file)])
          .then(function (result) {
            final.push({
              path: file,
              content: result[0],
            });
          })
          .finally(function () {
            let encodedStructure = {};

            if (final.length == files.length && !currentBranch.startsWith('_minisauras_') && files.length !== 0) {
              final.forEach(function (eachData) {
                encodedStructure[eachData.path] = eachData["content"];
              });

              let prDescription = 'Changes in these files:\n';
              files.forEach(function (f) {
                    prDescription += `- **${f}** \n`;
              });

              try {
                pluginOctokit.createPullRequest({
                  owner: repoInfo.owner,
                  repo: repoInfo.repo,
                  title: `Minified ${files.length} files`,
                  body: prDescription,
                  head: newBranchName,
                  changes: [{
                    files: encodedStructure,
                    commit: `Minified ${files.length} files`,
                  }, ],
                });
              } catch (error) {
                throw new Error(error);
              }
            }
          })
          .catch(function (error) {
            throw new Error(error);
          });
      });
    });
  } catch (error) {
    throw new Error(error);
  }
})();

const readAndMinify = async function (file) {
  const content = fs.readFileSync(file, "utf8");
  const extension = path.extname(file);

  // minify file
  if (extension === ".js") {
    const result = await minify(content, {
      compress: true,
    });
    return result.code;
  } else if (extension === ".css") {
    return csso.minify(content).css;
  } else {
    console.log("Other files");
  }
};