var FRAMERATE = 30;

function vectorAdd(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vectorSub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vectorScale(v, scale) {
    return [v[0] * scale, v[1] * scale, v[2] * scale];
}

function vectorDist(v) {
    return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
}

function vectorDistSquared(v) {
    return v[0]*v[0] + v[1]*v[1] + v[2]*v[2];
}

function vectorNormalize(v) {
    return vectorScale(v, 1 / vectorDist(v));
}


function Mass(position, velocity, mass, imageFilename) {
    this.position = position || [0, 0, 0]
    this.velocity = velocity || [0, 0, 0];
    this.force = [0, 0, 0];
    this.mass = mass || 1;
    this.imageFilename = imageFilename || "planet128.png";
    this.color = [1, 1, 1, 1];
    this.rotation = Math.random() * (Math.PI * 2);
    this.spin = Math.random() * (Math.PI * 2) * 2 - (Math.PI * 2);
    this.frozen = false;
};

Mass.prototype.initialize = function() {
    this.force = [0, 0, 0];
};

Mass.prototype.applyForce = function(force) {
    this.force = vectorAdd(this.force, force);
};

Mass.prototype.step = function(timeStep) {
    this.rotation += this.spin * timeStep;
    
    if (this.frozen) return;
	
    //Euler method
    this.position = vectorAdd(this.position, vectorScale(this.velocity, timeStep));
    this.velocity = vectorAdd(this.velocity, vectorScale(vectorScale(this.force, 1 / this.mass), timeStep));
};

function Orbit(renderer) {
    this.timeScale = 1;
    
    this.masses = [];
    this.earth = new Mass([11, 0, 0], [0, 7, 0], 2, "earth512.png");
    this.masses.push(this.earth);
    this.masses.push(new Mass([0, 10, 0], [-1, 0, 7], 1.5, "mars512.png"));
    this.masses.push(new Mass([0, 0, 9], [7, 0, 0], 1.5, "planet128.png"));
    this.masses.push(new Mass([-20, 0, -5], [0, -3, -2], 1, "neptune512.png"));
    
    this.sun = new Mass([0, 0, 0], [0, 0, 0], 500, "sun512.png");
    this.sun.spin = 0.2;
    this.masses.push(this.sun);
    
    this.renderer = renderer;
}

Orbit.prototype.step = function(timeStep) {
    this.solve();
    
    for (var i = 0; i < this.masses.length; i ++) {
        this.masses[i].step(timeStep * this.timeScale);
    }
    
    this.masses.sort(function(a, b) {
        if (a.position[2] < b.position[2]) return  1;
        if (b.position[2] < a.position[2]) return -1;
        return 0;
    });
    
    for (var i = 0; i < this.masses.length; i ++) {
        var m = this.masses[i];
        this.renderer.drawPlanet(m.position, m.imageFilename, 1 + Math.log(m.mass), m.rotation, m.color);
    }
};

Orbit.prototype.solve = function() {
    for (var i = 0; i < this.masses.length; i ++) {
        var m1 = this.masses[i];
        if (m1.frozen) continue;
        m1.initialize();
        
        for (var j = 0; j < this.masses.length; j ++) {
            var m2 = this.masses[j];
            if (m1 == m2) continue;
            
            var difference = vectorSub(m2.position, m1.position);
            var gravity = (m1.mass * m2.mass) / vectorDistSquared(difference);
            m1.applyForce(vectorScale(vectorNormalize(difference), gravity));
        }
    }
};

function Renderer(canvas, images) {
    this.initialized = true; //Will set to false when something breaks.
    
    this.canvas = canvas;
    this.webGLContext = this.canvas.getContext("experimental-webgl", {premultipliedAlpha: false, alpha: true});
    var gl = this.webGLContext;
    this.a = 0;
    this.doYRotation = false;
    this.cameraPosition = [0, 0, -10];
    
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    try {
        var vertexShader = this.setupShader(gl.VERTEX_SHADER, "#vertexShader");
        var fragmentShader = this.setupShader(gl.FRAGMENT_SHADER, "#fragmentShader");
    } catch (e) {
        console.log(e);
        this.initialized = false;
        return;
    }
    
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked) {
        var lastError = gl.getProgramInfoLog(program);
        console.log("Error linking program: " + lastError);
        gl.deleteProgram(program);
        
        this.initialized = false;
        return;
    }
    
    gl.useProgram(program);
    
    this.matrixLocation = gl.getUniformLocation(program, "u_matrix");
    this.colorLocation = gl.getUniformLocation(program, "u_color");
    
    var texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            0.0, 1.0,
            1.0, 0.0,
            1.0, 1.0
        ]),
        gl.STATIC_DRAW
    );
    var texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
    
    this.textures = {};
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    for (var filename in images) {
        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[filename]);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
        
        this.textures[filename] = texture;
    }
    
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
            -1.0, -1.0, 0.0,
             1.0, -1.0, 0.0,
            -1.0,  1.0, 0.0,
            -1.0,  1.0, 0.0,
             1.0, -1.0, 0.0,
             1.0,  1.0, 0.0
        ]),
        gl.STATIC_DRAW
    );
    
    var positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    
    var aspectRatio = canvas.width / canvas.height;
    var sx = 1 / (20 * aspectRatio);
    var sy = 1 / 20;
    var sz = 1 / 20;
    this.projectionMatrix = new Float32Array([
        sx,  0,  0, 0,
         0, sy,  0, 0,
         0,  0, sz, 0,
         0,  0,  0, 1
    ]);
}

Renderer.prototype.setupShader = function(shaderType, scriptElementSelector) {
    var gl = this.webGLContext;
    if ([gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].indexOf(shaderType) == -1) throw "Invalid shader.";
    
    var $script = $(scriptElementSelector);
    if ($script.length == 0) throw "No script element '" + scriptElementSelector + "'";
    
    var shader = gl.createShader(shaderType);
    gl.shaderSource(shader, $script.html());
    gl.compileShader(shader);
    var compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!compiled) {
        var lastError = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw "Error compiling shader '" + shader + "': " + lastError;
    }
    
    return shader;
}

Renderer.prototype.drawPlanet = function(position, imageFilename, scale, rotation, color) {
    var gl = this.webGLContext;
    
    // https://en.wikipedia.org/wiki/Scaling_matrix
    var sx = scale;
    var sy = scale;
    var sz = scale;
    var scalingMatrix = new Float32Array([
        sx,  0,  0, 0,
         0, sy,  0, 0,
         0,  0, sz, 0,
         0,  0,  0, 1
    ]);
    
    // https://en.wikipedia.org/wiki/Rotation_matrix
    var cosine = Math.cos(rotation);
    var sine = Math.sin(rotation);
    var zRotationMatrix = new Float32Array([
        cosine,  -sine, 0, 0,
          sine, cosine, 0, 0,
             0,      0, 1, 0,
             0,      0, 0, 1
    ]);
    
    var p = position;
    var translationMatrix = new Float32Array([
           1,    0,    0, 0,
           0,    1,    0, 0,
           0,    0,    1, 0,
        p[0], p[1], p[2], 1
    ]);
    
    // https://en.wikipedia.org/wiki/Rotation_matrix
    var cosine = Math.cos(this.a);
    var sine = Math.sin(this.a);
    var sceneYRotation = new Float32Array([
        cosine, 0,   sine, 0,
             0, 1,      0, 0,
         -sine, 0, cosine, 0,
             0, 0,      0, 1
    ]);
    
    var c = this.cameraPosition;
    var cameraTranslationMatrix = new Float32Array([
            1,     0,     0, 0,
            0,     1,     0, 0,
            0,     0,     1, 0,
        -c[0], -c[1], -c[2], 1
    ]);
    
    var multiplicationList = [scalingMatrix, zRotationMatrix, translationMatrix, sceneYRotation, cameraTranslationMatrix, this.projectionMatrix];
    var matrix = multiplicationList[0];
    for (var i = 1; i < multiplicationList.length; i ++) {
        if (matrix != null) {
            matrix = multiplyMat4(matrix, multiplicationList[i]);
        }
        else {
            matrix = multiplicationList[i];
        }
    }
    
    gl.uniformMatrix4fv(this.matrixLocation, false, matrix);
    gl.uniform4f(this.colorLocation, color[0], color[1], color[2], color[3]);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[imageFilename]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function multiplyMat4(a, b) {
    // https://www.khanacademy.org/math/algebra/algebra-matrices/matrix_multiplication/v/matrix-multiplication--part-1
    return new Float32Array([
        a[ 0]*b[0]+a[ 1]*b[4]+a[ 2]*b[8]+a[ 3]*b[12], a[ 0]*b[1]+a[ 1]*b[5]+a[ 2]*b[9]+a[ 3]*b[13], a[ 0]*b[2]+a[ 1]*b[6]+a[ 2]*b[10]+a[ 3]*b[14], a[ 0]*b[3]+a[ 1]*b[7]+a[ 2]*b[11]+a[ 3]*b[15],
        a[ 4]*b[0]+a[ 5]*b[4]+a[ 6]*b[8]+a[ 7]*b[12], a[ 4]*b[1]+a[ 5]*b[5]+a[ 6]*b[9]+a[ 7]*b[13], a[ 4]*b[2]+a[ 5]*b[6]+a[ 6]*b[10]+a[ 7]*b[14], a[ 4]*b[3]+a[ 5]*b[7]+a[ 6]*b[11]+a[ 7]*b[15],
        a[ 8]*b[0]+a[ 9]*b[4]+a[10]*b[8]+a[11]*b[12], a[ 8]*b[1]+a[ 9]*b[5]+a[10]*b[9]+a[11]*b[13], a[ 8]*b[2]+a[ 9]*b[6]+a[10]*b[10]+a[11]*b[14], a[ 8]*b[3]+a[ 9]*b[7]+a[10]*b[11]+a[11]*b[15],
        a[12]*b[0]+a[13]*b[4]+a[14]*b[8]+a[15]*b[12], a[12]*b[1]+a[13]*b[5]+a[14]*b[9]+a[15]*b[13], a[12]*b[2]+a[13]*b[6]+a[14]*b[10]+a[15]*b[14], a[12]*b[3]+a[13]*b[7]+a[15]*b[11]+a[15]*b[15],
    ]);
}

var isActive = true;
$(window).focus(function() {
    isActive = true;
});

$(window).blur(function() {
    isActive = false;
});

function mainLoop(orbit, renderer) {
    if (isActive) {
        var timeStep = 1000 / FRAMERATE / 1000;
        orbit.step(timeStep);
        
        if (renderer.doYRotation) {
            renderer.a += (Math.PI / 4) * timeStep;
        }
        
        setTimeout(mainLoop, 1000 / FRAMERATE, orbit, renderer);
    }
    else {
        setTimeout(mainLoop, 1000, orbit, renderer);
    }
}

function loadImages(filenames, callbackFunction) {
    var images = {};
    for (var i = 0; i < filenames.length; i ++) {
        images[filenames[i]] = null;
    }
    
    var imageonload = function(e) {
        var image = e.target;
        var filename = image.src.substring(image.src.lastIndexOf("/") + 1);
        images[filename] = image;
        
        var finishedLoading = true;
        for (var key in images) {
            if (images[key] == null) finishedLoading = false;
        }
        
        if (finishedLoading) {
            callbackFunction(images);
        }
    }
    
    for (var i = 0; i < filenames.length; i ++) {
        var image = new Image();
        image.onload = imageonload;
        image.onerror = imageonload;
        image.src = "img/" + filenames[i];
    }
}

$(document).ready(function() {
    var imagesLoaded = function(images) {
        var canvas = document.getElementById("canvas");
        var renderer = new Renderer(canvas, images);
        if (!renderer.initialized) {
            console.log("Renderer not initialized");
            return;
        }
        
        var orbit = new Orbit(renderer);
        
        mainLoop(orbit, renderer);
        
        $("#addPlanet").click(function() {
            var randomVector = function(magnitude) {
                var a = Math.random() * Math.PI * 2;
                return [
                     Math.cos(a) * magnitude,
                    -Math.sin(a) * magnitude,
                     Math.sin(a) * magnitude,
                ];
            }
            var m = new Mass(randomVector(10), randomVector(8), 1 + Math.random() * 2, 
"planet128.png");
            m.color = [Math.random(), Math.random(), Math.random(), 1];
            orbit.masses.push(m);
        });
        
        // Removed from HTML
        $("#toggleYRotation").click(function() {
            renderer.doYRotation = !renderer.doYRotation;
            if (renderer.doYRotation) {
                $("#toggleYRotation").html("Disable Y Rotation");
            }
            else {
                $("#toggleYRotation").html("Enable Y Rotation");
            }
        });
    };
    
    // https://commons.wikimedia.org/wiki/File:The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg
    // https://commons.wikimedia.org/wiki/File:The_Earth_seen_from_Apollo_17.jpg
    // https://commons.wikimedia.org/wiki/File:Water_ice_clouds_hanging_above_Tharsis_PIA02653.jpg
    // https://commons.wikimedia.org/wiki/File:Deathvalleysky_nps_big.jpg
    // https://commons.wikimedia.org/wiki/File:Neptune.jpg
    loadImages(["sun512.png", "earth512.png", "mars512.png", "neptune512.png", "planet128.png"], imagesLoaded);
});
