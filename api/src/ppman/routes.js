const repos = new Map()
const state = require("../state")
const logger = require("logplease").create("ppman/routes")
const {Repository} = require("./repo")
const semver = require("semver")

async function get_or_construct_repo(slug){
    if(repos.has(slug))return repos.get(slug)
    if(state.state.get("repositories").has(slug)){
        const repo_url = state.state.get("repositories").get(slug)
        const repo = new Repository(slug, repo_url)
        await repo.load()
        repos.set(slug, repo)
        return repo
    }
    logger.warn(`Requested repo ${slug} does not exist`)
    return null
}

async function get_package(repo, lang, version){
    var candidates = repo.packages.filter(
        pkg => pkg.language == lang && semver.satisfies(pkg.version, version)
    )
    return candidates.sort((a,b)=>semver.rcompare(a.version,b.version))[0] || null
}

module.exports = {
    async repo_list(req,res){
        // GET /repos

        logger.debug("Request for repoList")
        res.json_success({
            repos: (await Promise.all(
                [...state.state.get("repositories").keys()].map( async slug => await get_or_construct_repo(slug))
            )).map(repo=>({
                slug: repo.slug,
                url: repo.url,
                packages: repo.packages.length
            }))
        })
    },
    async repo_add(req, res){
        // POST /repos

        logger.debug(`Request for repoAdd slug=${req.body.slug} url=${req.body.url}`)
        if(!req.body.slug)
            return res.json_error("slug is missing from request body", 400)
        if(!req.body.url)
            return res.json_error("url is missing from request body", 400)
        
        const repo_state = state.state.get("repositories")

        if(repo_state.has(req.body.slug)) return res.json_error(`repository ${req.body.slug} already exists`, 409)
        
        repo_state.set(req.body.slug, req.body.url)
        logger.info(`Repository ${req.body.slug} added url=${req.body.url}`)

        return res.json_success(req.body.slug)
    },
    async repo_info(req, res){
        // GET /repos/:slug

        logger.debug(`Request for repoInfo for ${req.params.repo_slug}`)
        const repo = await get_or_construct_repo(req.params.repo_slug)        

        if(repo == null) return res.json_error(`Requested repo ${req.params.repo_slug} does not exist`, 404)
        
        res.json_success({
            slug: repo.slug,
            url: repo.url,
            packages: repo.packages.length
        })
    },
    async repo_packages(req, res){
        // GET /repos/:slug/packages
        logger.debug("Request to repoPackages")

        const repo = await get_or_construct_repo(req.params.repo_slug)        
        if(repo == null) return res.json_error(`Requested repo ${req.params.repo_slug} does not exist`, 404)

        res.json_success({
            packages: repo.packages.map(pkg=>({
                language: pkg.language,
                language_version: pkg.version.raw,
                installed: pkg.installed
            }))
        })
    },
    async package_info(req, res){
        // GET /repos/:slug/packages/:language/:version

        logger.debug("Request to packageInfo")

        const repo = await get_or_construct_repo(req.params.repo_slug)        
        if(repo == null) return res.json_error(`Requested repo ${req.params.repo_slug} does not exist`, 404)

        const package = await get_package(repo, req.params.language, req.params.version)
        if(package == null) return res.json_error(`Requested package ${req.params.language}-${req.params.version} does not exist`, 404)

        res.json_success({
            language: package.language,
            language_version: package.version.raw,
            author: package.author,
            buildfile: package.buildfile,
            size: package.size,
            dependencies: package.dependencies,
            installed: package.installed
        })
    },
    async package_install(req,res){
        // POST /repos/:slug/packages/:language/:version

        logger.debug("Request to packageInstall")

        const repo = await get_or_construct_repo(req.params.repo_slug)        
        if(repo == null) return res.json_error(`Requested repo ${req.params.repo_slug} does not exist`, 404)

        const package = await get_package(repo, req.params.language, req.params.version)
        if(package == null) return res.json_error(`Requested package ${req.params.language}-${req.params.version} does not exist`, 404)

        try{
            const response = await package.install()
            return res.json_success(response)
        }catch(err){
            logger.error(`Error while installing package ${package.language}-${package.version}:`, err.message)
            res.json_error(err.message,500)
        }
        

    },
    async package_uninstall(req,res){
        // DELETE /repos/:slug/packages/:language/:version

        res.json(req.body) //TODO
    }
}