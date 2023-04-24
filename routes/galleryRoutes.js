const router = require("express").Router();
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { validateGalleryList, validateGalleryInsert, validateGalleryDetail } = require("../json-schemas.js");
const GALLERIES_FOLDER = "galleries";

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const folderPath = path.join(__dirname, "..", GALLERIES_FOLDER, req.params.path); // Build the folder path based on the request
      cb(null, folderPath); // Pass the folder path to multer
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname); // Use the original file name for the uploaded file
    },
});

const upload = multer({ storage });

const handleUpload = (req, res, next) => {
    try {
        const data = fs.readFileSync('gallery.json');
        const json = JSON.parse(data);
        const gallery = findElementByPath(json, req.params.path);
        if(!gallery) {
            return res.status(404).json({
                code: 404,
                name: "NOT_FOUND",
                description: "None"
            });
        }
        upload.single('image')(req, res, (err) => {
            if (err) {
                return res.status(400).json({
                    code: 400,
                    name: "BAD_REQUEST",
                    description: "file not found"
                });
            }
            next();
        });
    } catch (err) {
        return res.status(500).json({
            code: 500,
            name: "INTERNAL_SERVER_ERROR",
            description: "An error occurred while processing your request. Please try again later."
        });
    }
};

const alreadyExists = (json, newGallery) => {
    return json.some(element => element.name === newGallery.name);
}

const findElementByPath = (json, path) => {
    return json.find(element => element.path === path);
}

router.get("", (req, res) =>{
    try{
        const data = fs.readFileSync('gallery.json');
        const json = JSON.parse(data);
        const newData = json.map(({path, name}) => ({path, name}));
        const result = {
            galleries: newData
        };
        const isValid = validateGalleryList(result);
        if (isValid) return res.status(200).json(result);
    } catch (err) {
        return res.status(500).json({
            code: 500,
            name: "INTERNAL_SERVER_ERROR",
            description: "An error occurred while processing your request. Please try again later."
        });
    }
});

router.post("", async (req, res) =>{
    try {
        const isValid = validateGalleryInsert(req.body);
        if (!isValid) return res.status(400).send("error");

        const newGallery = {
            path: req.body.name,
            name: req.body.name,
            images: []
        }
        const data = fs.readFileSync('gallery.json');
        const json = JSON.parse(data);

        if(alreadyExists(json, newGallery)) {
            return res.status(409).json({
                code: 409,
                name: "CONFLICT",
                description: "directory already exists"
            });
        }

        json.push(newGallery);
        const newData = JSON.stringify(json);
        fs.writeFileSync('gallery.json', newData);
        await fs.promises.mkdir(`${GALLERIES_FOLDER}/${newGallery.path}`, { recursive: true });
        return res.status(201).json({
            path: newGallery.path,
            name: newGallery.name
        });
    } catch (err) {
        return res.status(500).json({
            code: 500,
            name: "INTERNAL_SERVER_ERROR",
            description: "An error occurred while processing your request. Please try again later."
        });
    }
});

router.get("/:path", (req, res) => {
    try{
        const { path } = req.params;

        const data = fs.readFileSync('gallery.json');
        const json = JSON.parse(data);
        const gallery = findElementByPath(json, path);
        if(!gallery) {
            return res.status(404).json({
                code: 404,
                name: "NOT_FOUND",
                description: "None"
            });
        }

        const images = {
            gallery: {
                path: gallery.path,
                name: gallery.name
            },
            images: gallery.images
        }

        const isValid = validateGalleryDetail(images);
        if(isValid) return res.status(200).json(images);
    } catch (err) {
        return res.status(500).json({
            code: 500,
            name: "INTERNAL_SERVER_ERROR",
            description: "An error occurred while processing your request. Please try again later."
        });
    }
});

router.post("/:path", handleUpload, (req, res) => {
    try{
        if (!req.file) {
            return res.status(400).json({
                code: 400,
                name: "BAD_REQUEST",
                description: "zero files uploaded"
            });
        }
        const data = fs.readFileSync('gallery.json');
        const json = JSON.parse(data);

        const filePath = req.file.filename;
        const fullPath = req.params.path + "/" + req.file.filename;
        let name = path.basename(fullPath, path.extname(fullPath));
        name = name.charAt(0).toUpperCase() + name.slice(1);
        const modified = fs.statSync(`${GALLERIES_FOLDER}/${fullPath}`).mtime.toISOString();
        const newImage = {
            path: filePath,
            fullpath: fullPath,
            name: name,
            modified: modified,
        };

        json.forEach(element => {
            if(element.path === req.params.path){
                element.images.push(newImage);
            }
        });
        const newData = JSON.stringify(json);
        fs.writeFileSync('gallery.json', newData);

        return res.status(201).json({
            uploaded: [newImage]
        });
    } catch (err) {
        return res.status(500).json({
            code: 500,
            name: "INTERNAL_SERVER_ERROR",
            description: "An error occurred while processing your request. Please try again later."
        });
    }
});

router.delete("/:path(*)", async (req, res) => {
    try{
        const data = fs.readFileSync('gallery.json');
        const json = JSON.parse(data);
        var isFolder = false;
        var isImage = false;
        const filteredJson = json.filter(obj => {
            if (obj.path === req.params.path) {
                isFolder = true;
            return false;
            } else {
                obj.images = obj.images.filter(img => {
                    if(img.fullpath === req.params.path){
                        isImage = true;
                        return false;
                    }else{
                        return true;
                    }
                });
            return true;
            }
        });

        if(!isFolder && !isImage) {
            return res.status(404).json({
                code: 404,
                name: "NOT_FOUND",
                description: `directory/file ${req.params.path} not exists`
            });
        }

        if(isFolder){
            const folderPath = path.join(__dirname, "..", GALLERIES_FOLDER, req.params.path);
            await fs.promises.rm(folderPath, { recursive: true });
        }else if(isImage){
            const filePath = path.join(__dirname, "..", GALLERIES_FOLDER, req.params.path);
            await fs.promises.unlink(filePath);
        }
        const newData = JSON.stringify(filteredJson);
        fs.writeFileSync('gallery.json', newData);
        return res.status(200).json({
            status: "ok"
        });
    } catch (err) {
        return res.status(500).json({
            code: 500,
            name: "INTERNAL_SERVER_ERROR",
            description: "An error occurred while processing your request. Please try again later."
        });
    }
});

router.put("/:path", async (req, res) =>{
    try{
        const isValid = validateGalleryInsert(req.body);
        if (!isValid) return res.status(400).send("error");

        const data = fs.readFileSync('gallery.json');
        const json = JSON.parse(data);
        const gallery = findElementByPath(json, req.params.path);
        if(!gallery) {
            return res.status(404).json({
                code: 404,
                name: "NOT_FOUND",
                description: "None"
            });
        }

        json.forEach(element => {
            if(element.path === req.params.path){
                element.name = req.body.name;
                element.path = req.body.name;
                element.images.forEach(image => {
                    image.fullpath = `${element.path}/${image.path}`;
                });
            }
        });

        const newData = JSON.stringify(json);
        fs.writeFileSync('gallery.json', newData);
        const currentPath = path.join(__dirname, "..", GALLERIES_FOLDER, req.params.path);
        const newPath = path.join(__dirname, "..", GALLERIES_FOLDER, req.body.name);
        await fs.promises.rename(currentPath, newPath);

        return res.status(200).json({
            path: req.body.name,
            name: req.body.name
        });
    } catch (err) {
        return res.status(500).json({
            code: 500,
            name: "INTERNAL_SERVER_ERROR",
            description: "An error occurred while processing your request. Please try again later."
        });
    }
});

module.exports = router;