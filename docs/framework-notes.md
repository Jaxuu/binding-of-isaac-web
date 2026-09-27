## C7: MDN canvas game loop / drawing
### Loop animation using window.requestAnimationFrame

Source: https://github.com/mdn/content/blob/main/files/en-us/learn_web_development/extensions/client-side_apis/drawing_graphics/index.md

Calls requestAnimationFrame() at the bottom of the draw() function to continuously loop the canvas drawing routine.

```javascript
window.requestAnimationFrame(draw);
```

--------------------------------

### Draw an animated clock using Canvas 2D and requestAnimationFrame

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/canvas_api/tutorial/basic_animations/index.md

Renders an animated analog clock showing the current time by continuously clearing and redrawing canvas elements via requestAnimationFrame. The animation loop updates at the display refresh rate while advancing hands according to Date object values.

```html
<canvas id="canvas" width="150" height="150">The current time</canvas>
```

```js
function clock() {
  const now = new Date();
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.clearRect(0, 0, 150, 150);
  ctx.translate(75, 75);
  ctx.scale(0.4, 0.4);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = "black";
  ctx.fillStyle = "white";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";

  // Hour marks
  ctx.save();
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.rotate(Math.PI / 6);
    ctx.moveTo(100, 0);
    ctx.lineTo(120, 0);
    ctx.stroke();
  }
  ctx.restore();

  // Minute marks
  ctx.save();
  ctx.lineWidth = 5;
  for (let i = 0; i < 60; i++) {
    if (i % 5 !== 0) {
      ctx.beginPath();
      ctx.moveTo(117, 0);
      ctx.lineTo(120, 0);
      ctx.stroke();
    }
    ctx.rotate(Math.PI / 30);
  }
  ctx.restore();

  const sec = now.getSeconds();
  // To display a clock with a sweeping second hand, use:
  // const sec = now.getSeconds() + now.getMilliseconds() / 1000;
  const min = now.getMinutes();
  const hr = now.getHours() % 12;

  ctx.fillStyle = "black";

  // Write image description
  canvas.innerText = `The time is: ${hr}:${min}`;

  // Write Hours
  ctx.save();
  ctx.rotate(
    (Math.PI / 6) * hr + (Math.PI / 360) * min + (Math.PI / 21600) * sec,
  );
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.lineTo(80, 0);
  ctx.stroke();
  ctx.restore();

  // Write Minutes
  ctx.save();
  ctx.rotate((Math.PI / 30) * min + (Math.PI / 1800) * sec);
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(-28, 0);
  ctx.lineTo(112, 0);
  ctx.stroke();
  ctx.restore();

  // Write seconds
  ctx.save();
  ctx.rotate((sec * Math.PI) / 30);
  ctx.strokeStyle = "#D40000";
  ctx.fillStyle = "#D40000";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-30, 0);
  ctx.lineTo(83, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2, true);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(95, 0, 10, 0, Math.PI * 2, true);
  ctx.stroke();
  ctx.fillStyle = "transparent";
  ctx.arc(0, 0, 3, 0, Math.PI * 2, true);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.lineWidth = 14;
  ctx.strokeStyle = "#325FA2";
  ctx.arc(0, 0, 142, 0, Math.PI * 2, true);
  ctx.stroke();

  ctx.restore();

  window.requestAnimationFrame(clock);
}

window.requestAnimationFrame(clock);
```

--------------------------------

### Define the canvas animation loop

Source: https://github.com/mdn/content/blob/main/files/en-us/learn_web_development/extensions/advanced_javascript_objects/object_building_practice/index.md

Draws a semi-transparent black overlay across the canvas to create motion trails, then draws and updates each ball. Recursively schedules subsequent frames using requestAnimationFrame.

```javascript
function loop() {
  ctx.fillStyle = "rgb(0 0 0 / 25%)";
  ctx.fillRect(0, 0, width, height);

  for (const ball of balls) {
    ball.draw();
    ball.update();
  }

  requestAnimationFrame(loop);
}
```

--------------------------------

### Creating an animation loop with requestAnimationFrame

Source: https://github.com/mdn/content/blob/main/files/en-us/learn_web_development/extensions/client-side_apis/drawing_graphics/index.md

Repeatedly clears and updates the canvas on each frame using requestAnimationFrame. The initial loop call starts the continuous rendering cycle.

```javascript
function loop() {
  ctx.fillStyle = "rgb(0 0 0 / 25%)";
  ctx.fillRect(0, 0, width, height);

  for (const ball of balls) {
    ball.draw();
    ball.update();
    ball.collisionDetect();
  }

  requestAnimationFrame(loop);
}

loop();
```

--------------------------------

### Animate 2D bouncing balls using the Canvas API

Source: https://github.com/mdn/content/blob/main/files/en-us/learn_web_development/extensions/client-side_apis/drawing_graphics/index.md

Sets up an HTML canvas and runs a 2D animation loop that draws, moves, and checks collisions among bouncing balls. Requires a full-window HTML canvas container and uses requestAnimationFrame for continuous rendering.

```html
<h1>bouncing balls</h1>
<canvas></canvas>
```

```css
html,
body {
  margin: 0;
}

html {
  font-family: "Helvetica Neue", "Helvetica", "Arial", sans-serif;
  height: 100%;
}

body {
  overflow: hidden;
  height: inherit;
}

h1 {
  font-size: 2rem;
  letter-spacing: -1px;
  position: absolute;
  margin: 0;
  top: -4px;
  right: 5px;

  color: transparent;
  text-shadow: 0 0 4px white;
}
```

```javascript
// set up canvas

const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

const width = (canvas.width = window.innerWidth);
const height = (canvas.height = window.innerHeight);

// function to generate random number

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// function to generate random RGB color value

function randomRGB() {
  return `rgb(${random(0, 255)} ${random(0, 255)} ${random(0, 255)})`;
}

const balls = [];

class Ball {
  constructor(x, y, velX, velY, color, size) {
    this.x = x;
    this.y = y;
    this.velX = velX;
    this.velY = velY;
    this.color = color;
    this.size = size;
  }

  draw() {
    ctx.beginPath();
    ctx.fillStyle = this.color;
    ctx.arc(this.x, this.y, this.size, 0, 2 * Math.PI);
    ctx.fill();
  }

  update() {
    if (this.x + this.size >= width) {
      this.velX = -Math.abs(this.velX);
    }

    if (this.x - this.size <= 0) {
      this.velX = Math.abs(this.velX);
    }

    if (this.y + this.size >= height) {
      this.velY = -Math.abs(this.velY);
    }

    if (this.y - this.size <= 0) {
      this.velY = Math.abs(this.velY);
    }

    this.x += this.velX;
    this.y += this.velY;
  }

  collisionDetect() {
    for (const ball of balls) {
      if (!(this === ball)) {
        const dx = this.x - ball.x;
        const dy = this.y - ball.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.size + ball.size) {
          ball.color = this.color = randomRGB();
        }
      }
    }
  }
}

while (balls.length < 25) {
  const size = random(10, 20);
  const ball = new Ball(
    // ball position always drawn at least one ball width
    // away from the edge of the canvas, to avoid drawing errors
    random(0 + size, width - size),
    random(0 + size, height - size),
    random(-7, 7),
    random(-7, 7),
    randomRGB(),
    size,
  );

  balls.push(ball);
}

function loop() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillRect(0, 0, width, height);

  for (const ball of balls) {
    ball.draw();
    ball.update();
    ball.collisionDetect();
  }

  requestAnimationFrame(loop);
}

loop();
```

--------------------------------

### Set up animation loop with AnalyserNode.getByteFrequencyData()

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/web_audio_api/visualizations_with_web_audio_api/index.md

Starts the `draw()` animation loop using `requestAnimationFrame()` and collects current frequency values into `dataArray`. Clears and redraws the canvas background with a solid black fill on each frame.

```javascript
function draw() {
  drawVisual = requestAnimationFrame(draw);

  analyser.getByteFrequencyData(dataArray);

  canvasCtx.fillStyle = "rgb(0 0 0)";
  canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

  // ...
}
```

--------------------------------

### Drawing and updating frames with animateScene

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/webgl_api/basic_2d_animation_example/index.md

Sets uniforms, binds vertex buffers, and draws geometry for each animation frame. Recursively schedules subsequent frames using requestAnimationFrame while calculating delta rotation angles.

```javascript
function animateScene() {
  gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  gl.clearColor(0.8, 0.9, 1.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const radians = (currentAngle * Math.PI) / 180.0;
  currentRotation[0] = Math.sin(radians);
  currentRotation[1] = Math.cos(radians);

  gl.useProgram(shaderProgram);

  uScalingFactor = gl.getUniformLocation(shaderProgram, "uScalingFactor");
  uGlobalColor = gl.getUniformLocation(shaderProgram, "uGlobalColor");
  uRotationVector = gl.getUniformLocation(shaderProgram, "uRotationVector");

  gl.uniform2fv(uScalingFactor, currentScale);
  gl.uniform2fv(uRotationVector, currentRotation);
  gl.uniform4fv(uGlobalColor, [0.1, 0.7, 0.2, 1.0]);

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

  aVertexPosition = gl.getAttribLocation(shaderProgram, "aVertexPosition");

  gl.enableVertexAttribArray(aVertexPosition);
  gl.vertexAttribPointer(
    aVertexPosition,
    vertexNumComponents,
    gl.FLOAT,
    false,
    0,
    0,
  );

  gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

  requestAnimationFrame((currentTime) => {
    const deltaAngle =
      ((currentTime - previousTime) / 1000.0) * degreesPerSecond;

    currentAngle = (currentAngle + deltaAngle) % 360;

    previousTime = currentTime;
    animateScene();
  });
}
```

--------------------------------

### Animate an OffscreenCanvas in a dedicated worker

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/dedicatedworkerglobalscope/requestanimationframe/index.md

Transfers canvas control from the main thread to a dedicated worker and runs an animation loop using requestAnimationFrame(). The main thread controls the animation lifecycle via postMessage.

```html
<canvas width="100" height="100"></canvas>
```

```javascript
const worker = new Worker("worker.js");

// Transfer canvas control to the worker
const offscreenCanvas = document
  .querySelector("canvas")
  .transferControlToOffscreen();

// Start the animation
worker.postMessage(
  {
    type: "start",
    canvas: offscreenCanvas,
  },
  [offscreenCanvas],
);

// Stop the animation after 5 seconds
setTimeout(() => {
  worker.postMessage({
    type: "stop",
  });
}, 5000);
```

```javascript
let ctx;
let pos = 0;
let animationId;
let isRunning = false;
let lastTime = 0;

function draw(currentTime) {
  if (!isRunning) return;

  // Calculate delta time for smooth animation
  if (lastTime === 0) lastTime = currentTime;
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  // Clear and draw the moving rectangle
  ctx.clearRect(0, 0, 100, 100);
  ctx.fillRect(pos, 0, 10, 10);
  pos += 50 * deltaTime; // Move 50 pixels per second

  // Loop the animation
  if (pos > 100) pos = -10;

  animationId = self.requestAnimationFrame(draw);
}

self.addEventListener("message", (e) => {
  if (e.data.type === "start") {
    const transferredCanvas = e.data.canvas;
    ctx = transferredCanvas.getContext("2d");
    isRunning = true;
    lastTime = 0;
    animationId = self.requestAnimationFrame(draw);
  }
  if (e.data.type === "stop") {
    isRunning = false;
    if (animationId) {
      self.cancelAnimationFrame(animationId);
    }
  }
});
```

--------------------------------

### Run an animation loop in a worker with requestAnimationFrame

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/offscreencanvas/index.md

Uses requestAnimationFrame within a Web Worker message handler to animate rendering on an OffscreenCanvas.

```javascript
onmessage = (evt) => {
  const canvas = evt.data.canvas;
  const gl = canvas.getContext("webgl");

  function render(time) {
    // Perform some drawing using the gl context
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
};
```

--------------------------------

### Update ball position on each frame

Source: https://github.com/mdn/content/blob/main/files/en-us/games/tutorials/2d_breakout_game_pure_javascript/move_the_ball/index.md

Increments x and y by dx and dy on every frame inside draw() to animate the ball. This leaves a trail on the canvas until frame clearing is implemented.

```javascript
function draw() {
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = "#0095DD";
  ctx.fill();
  ctx.closePath();
  x += dx;
  y += dy;
}
```

--------------------------------

### Implement a basic game loop with requestAnimationFrame

Source: https://github.com/mdn/content/blob/main/files/en-us/games/anatomy/index.md

Runs the game update and render logic synchronized with the browser's display refresh rate. Uses window.requestAnimationFrame to continuously schedule the next frame and passes the frame timestamp to the update function.

```javascript
/*
 * Starting with the semicolon is in case whatever line of code above this example
 * relied on automatic semicolon insertion (ASI). The browser could accidentally
 * think this whole example continues from the previous line. The leading semicolon
 * marks the beginning of our new line if the previous one was not empty or terminated.
 *
 * Let us also assume that MyGame is previously defined.
 */

;(() => {
  function main(tFrame) {
    MyGame.stopMain = window.requestAnimationFrame(main);

    update(tFrame); // Call your update method. In our case, we give it rAF's timestamp.
    render();
  }

  main(); // Start the cycle
})();
```

--------------------------------

### Requesting an animation frame for an inline XRSession

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/xrsession/requestanimationframe/index.md

Requests an inline session and updates WebGL viewports inside the animation frame callback.

```javascript
// Obtain XR object
const XR = navigator.xr;

// Request a new XRSession
XR.requestSession("inline").then((xrSession) => {
  xrSession.requestAnimationFrame((time, xrFrame) => {
    const viewer = xrFrame.getViewerPose(xrReferenceSpace);

    gl.bindFramebuffer(xrWebGLLayer.framebuffer);
    for (const xrView of viewer.views) {
      const xrViewport = xrWebGLLayer.getViewport(xrView);
      gl.viewport(
        xrViewport.x,
        xrViewport.y,
        xrViewport.width,
        xrViewport.height,
      );

      // WebGL draw calls will now be rendered into the appropriate viewport.
    }
  });
});
```

--------------------------------

### CanvasCaptureMediaStreamTrack.prototype.requestFrame()

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/canvascapturemediastreamtrack/index.md

Manually forces a frame to be captured from the canvas and sent to the stream. This is useful when a frameRate of 0 was specified upon stream creation to control frame delivery manually.

```APIDOC
## CanvasCaptureMediaStreamTrack.prototype.requestFrame()

### Description
Manually forces a frame to be captured and sent to the stream. This lets applications that wish to specify the frame capture times directly do so, if they specified a `frameRate` of 0 when calling `HTMLCanvasElement.captureStream()`.

### Syntax
```js
track.requestFrame();
```

### Parameters
None.

### Return Value
None (`undefined`).
```

--------------------------------

### Creating sprites from a sprite sheet

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/window/createimagebitmap/index.md

Loads an image, extracts individual sprites using createImageBitmap with specific crop rectangles and orientation options, and draws them to a canvas.

```html
Original image:
<img src="50x50.jpg" />
<hr />
<canvas id="myCanvas"></canvas>
```

```css
canvas {
  border: 2px solid green;
}
```

```javascript
const canvas = document.getElementById("myCanvas"),
  ctx = canvas.getContext("2d"),
  image = new Image();

// Wait for the sprite sheet to load
image.onload = () => {
  Promise.all([
    // Cut out two sprites from the sprite sheet
    createImageBitmap(image, 0, 0, 32, 32),
    createImageBitmap(image, 32, 0, 32, 32),
    createImageBitmap(image, 0, 0, 50, 50, { imageOrientation: "flipY" }),
  ]).then((sprites) => {
    // Draw each sprite onto the canvas
    ctx.drawImage(sprites[0], 0, 0);
    ctx.drawImage(sprites[1], 32, 32);
    ctx.drawImage(sprites[2], 64, 64);
  });
};

// Load the sprite sheet from an image file
image.src = "50x50.jpg";
```

--------------------------------

### Define a drawing loop using setInterval()

Source: https://github.com/mdn/content/blob/main/files/en-us/games/tutorials/2d_breakout_game_pure_javascript/move_the_ball/index.md

Sets up a recurring timer to execute the draw() function every 10 milliseconds for continuous canvas animation updates.

```javascript
function draw() {
  // drawing code
}
setInterval(draw, 10);
```

--------------------------------

### CanvasCaptureMediaStreamTrack.prototype.requestFrame()

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/canvascapturemediastreamtrack/requestframe/index.md

Requests that a frame be captured from the canvas and sent to the stream. This allows applications to manually control the timing of rendering and frame capture.

```APIDOC
## CanvasCaptureMediaStreamTrack.prototype.requestFrame()

### Description
Requests that a frame be captured from the canvas and sent to the stream. Applications that need to carefully control the timing of rendering and frame capture can use `requestFrame()` to directly specify when to capture a frame.

### Syntax
```js
requestFrame()
```

### Parameters
None.

### Return Value
None (`undefined`).

### Example
```js
// Find the canvas element to capture
const canvasElt = document.querySelector("canvas");

// Get the stream
const stream = canvasElt.captureStream(25); // 25 FPS

// Send the current state of the canvas as a frame to the stream
stream.getVideoTracks()[0].requestFrame();
```
```

--------------------------------

### requestAnimationFrame(animationFrameCallback)

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/xrsession/requestanimationframe/index.md

Schedules a callback function to update and render an XR scene before the next repaint. It returns a non-zero integer handle that can be used with cancelAnimationFrame() to cancel the request.

```APIDOC
## requestAnimationFrame(animationFrameCallback)

### Description
Schedules a function to be called before the next repaint to update and render the XR scene based on elapsed time, animation, and user input changes.

### Syntax
```js
requestAnimationFrame(animationFrameCallback)
```

### Parameters
- **animationFrameCallback** (`Function`) - Required. A function called before the next repaint. It receives two parameters:
  - **time** (`DOMHighResTimeStamp`) - The time offset at which the updated viewer state was received from the WebXR device.
  - **xrFrame** (`XRFrame`) - An object describing the state of objects being tracked by the session, used to obtain poses and other rendering information.

### Return Value
- **integer** - A unique, non-zero integer ID or handle that can be passed to `XRSession.cancelAnimationFrame()` to cancel the pending request.

### Example Usage
```js
xrSession.requestAnimationFrame((time, xrFrame) => {
  const viewer = xrFrame.getViewerPose(xrReferenceSpace);
  gl.bindFramebuffer(xrWebGLLayer.framebuffer);
  for (const xrView of viewer.views) {
    const xrViewport = xrWebGLLayer.getViewport(xrView);
    gl.viewport(
      xrViewport.x,
      xrViewport.y,
      xrViewport.width,
      xrViewport.height,
    );
  }
});
```
```

--------------------------------

### Draw frequency bar graph with getByteFrequencyData()

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/analysernode/getbytefrequencydata/index.md

Collects frequency data repeatedly using requestAnimationFrame and draws a bar graph visualization onto a canvas element.

```javascript
const audioCtx = new AudioContext();
const analyser = audioCtx.createAnalyser();

// …

analyser.fftSize = 256;
const bufferLength = analyser.frequencyBinCount;
console.log(bufferLength);
const dataArray = new Uint8Array(bufferLength);

canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

function draw() {
  drawVisual = requestAnimationFrame(draw);

  analyser.getByteFrequencyData(dataArray);

  canvasCtx.fillStyle = "rgb(0 0 0)";
  canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

  const barWidth = (WIDTH / bufferLength) * 2.5;
  let barHeight;
  let x = 0;

  forall (let i = 0; i < bufferLength; i++) {
    barHeight = dataArray[i];

    canvasCtx.fillStyle = `rgb(${barHeight + 100} 50 50)`;
    canvasCtx.fillRect(x, HEIGHT - barHeight / 2, barWidth, barHeight / 2);

    x += barWidth + 1;
  }
}

draw();
```

--------------------------------

### Implement animation loop using requestAnimationFrame

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/webgl_api/tutorial/animating_objects_with_webgl/index.md

Add this render loop at the end of the main() function to replace the static drawScene() call. It computes deltaTime in seconds, updates squareRotation, and re-renders continuously.

```javascript
let then = 0;

// Draw the scene repeatedly
function render(now) {
  now *= 0.001; // convert to seconds
  deltaTime = now - then;
  then = now;

  drawScene(gl, programInfo, buffers, squareRotation);
  squareRotation += deltaTime;

  requestAnimationFrame(render);
}
requestAnimationFrame(render);
```

--------------------------------

### Drawing video frames on a canvas using requestVideoFrameCallback()

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/htmlvideoelement/requestvideoframecallback/index.md

Demonstrates how to register a callback with `requestVideoFrameCallback()` to draw video frames onto a canvas synchronously with the video's frame rate and display FPS and frame metadata.

```javascript
const button = document.querySelector("button");
const video = document.querySelector("video");
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
const fpsInfo = document.querySelector("#fps-info");
const metadataInfo = document.querySelector("#metadata-info");

button.addEventListener("click", () =>
  video.paused ? video.play() : video.pause(),
);

video.addEventListener("play", () => {
  if (!("requestVideoFrameCallback" in HTMLVideoElement.prototype)) {
    console.error(
      "Your browser does not support the `Video.requestVideoFrameCallback()` API.",
    );
  }
});

let width = canvas.width;
let height = canvas.height;

let paintCount = 0;
let startTime = 0.0;

const updateCanvas = (now, metadata) => {
  if (startTime === 0.0) {
  startTime = now;
  }

  ctx.drawImage(video, 0, 0, width, height);

  const elapsed = (now - startTime) / 1000.0;
  const fps = (++paintCount / elapsed).toFixed(3);
  fpsInfo.innerText = !isFinite(fps) ? 0 : fps;
  metadataInfo.innerText = JSON.stringify(metadata, null, 2);

  video.requestVideoFrameCallback(updateCanvas);
};

video.src = "https://mdn.github.io/shared-assets/videos/flower.mp4";
video.requestVideoFrameCallback(updateCanvas);
```

```css
video,
canvas {
  max-width: 49%;
}
```

```html
<p>
  Start <button type="button">⏯</button> playing the video. Pause the video to
  read the metadata. Drawing video frames on the canvas is synced with the
  actual video framerate.
</p>
<video controls playsinline></video>
<canvas width="960" height="540"></canvas>
<p><span id="fps-info">0</span>fps</p>
<pre id="metadata-info"></pre>
```

--------------------------------

### Draw on canvas with animation loop

Source: https://github.com/mdn/content/blob/main/files/en-us/learn_web_development/extensions/client-side_apis/drawing_graphics/index.md

Continuously checks if the mouse button is pressed and draws a circle at the adjusted cursor location using current color and size picker values.

```js
function draw() {
  if (pressed) {
    ctx.fillStyle = colorPicker.value;
    ctx.beginPath();
    ctx.arc(
      curX,
      curY - 85,
      sizePicker.value,
      degToRad(0),
      degToRad(360),
      false,
    );
    ctx.fill();
  }

  requestAnimationFrame(draw);
}

draw();
```

--------------------------------

### requestAnimationFrame(callback)

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/dedicatedworkerglobalscope/requestanimationframe/index.md

Requests that the browser schedule a callback function to run before the next repaint in a dedicated worker context. Returns a non-zero long integer request ID that uniquely identifies the callback.

```APIDOC
## requestAnimationFrame(callback)

### Description
Tells the browser that you wish to perform an animation in the worker and requests that the browser call a specified function to update an animation before the next repaint.

### Syntax
```javascript
requestAnimationFrame(callback)
```

### Parameters
- **callback** (Function) - Required. The function to call when it's time to update your animation for the next repaint. The callback is passed a single argument:
  - **timestamp** (DOMHighResTimeStamp) - A timestamp indicating the end time of the previous frame's rendering (milliseconds since time origin with a minimal precision of 1ms).

### Return Value
- **long** - A non-zero long integer value representing the request ID uniquely identifying the entry in the callback list. Can be passed to `cancelAnimationFrame()` to cancel the refresh callback request.

### Exceptions
- **NotSupportedError** (`DOMException`) - Thrown if the method is not supported by the current worker.

### Example
```javascript
let animationId;

function draw(currentTime) {
  // Perform drawing / animation updates
  animationId = self.requestAnimationFrame(draw);
}

animationId = self.requestAnimationFrame(draw);
```
```

--------------------------------

### Complete 2D breakout game example with moving ball

Source: https://github.com/mdn/content/blob/main/files/en-us/games/tutorials/2d_breakout_game_phaser/move_the_ball/index.md

Combines the HTML script import, canvas reset styling, and JavaScript scene setup to animate the ball moving across the canvas.

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/phaser/3.90.0/phaser.js"></script>
```

```css
* {
  padding: 0;
  margin: 0;
}
```

```javascript
class ExampleScene extends Phaser.Scene {
  ball;

  preload() {
    this.load.setBaseURL(
      "https://mdn.github.io/shared-assets/images/examples/2D_breakout_game_Phaser",
    );

    this.load.image("ball", "ball.png");
  }
  create() {
    this.ball = this.add.sprite(50, 50, "ball");
  }
  update() {
    this.ball.x += 1;
    this.ball.y += 1;
  }
}

const config = {
  type: Phaser.CANVAS,
  width: 480,
  height: 320,
  scene: ExampleScene,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  backgroundColor: "#eeeeee",
};

const game = new Phaser.Game(config);
```

--------------------------------

### Draw an audio frequency spectrum to a canvas

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/analysernode/getfloatfrequencydata/index.md

Connects an audio element source to an AnalyserNode, continuously captures frequency data using requestAnimationFrame(), and renders a bar graph visualization onto a 2D canvas.

```javascript
const audioCtx = new AudioContext();

// Create audio source
// Here, we use an audio file, but this could also be e.g. microphone input
const audioEle = new Audio();
audioEle.src = "my-audio.mp3"; // Insert file name here
audioEle.autoplay = true;
audioEle.preload = "auto";
const audioSourceNode = audioCtx.createMediaElementSource(audioEle);

// Create analyser node
const analyserNode = audioCtx.createAnalyser();
analyserNode.fftSize = 256;
const bufferLength = analyserNode.frequencyBinCount;
const dataArray = new Float32Array(bufferLength);

// Set up audio node network
audioSourceNode.connect(analyserNode);
analyserNode.connect(audioCtx.destination);

// Create 2D canvas
const canvas = document.createElement("canvas");
canvas.style.position = "absolute";
canvas.style.top = "0";
canvas.style.left = "0";
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document.body.appendChild(canvas);
const canvasCtx = canvas.getContext("2d");
canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

function draw() {
  // Schedule next redraw
  requestAnimationFrame(draw);

  // Get spectrum data
  analyserNode.getFloatFrequencyData(dataArray);

  // Draw black background
  canvasCtx.fillStyle = "rgb(0 0 0)";
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw spectrum
  const barWidth = (canvas.width / bufferLength) * 2.5;
  let posX = 0;
  for (let i = 0; i < bufferLength; i++) {
    const barHeight = (dataArray[i] + 140) * 2;
    canvasCtx.fillStyle = `rgb(${Math.floor(barHeight + 100)} 50 50)`;
    canvasCtx.fillRect(
      posX,
      canvas.height - barHeight / 2,
      barWidth,
      barHeight / 2,
    );
    posX += barWidth + 1;
  }
}

draw();
```

--------------------------------

### Slice and draw sprite sheet frame with drawImage

Source: https://github.com/mdn/content/blob/main/files/en-us/learn_web_development/extensions/client-side_apis/drawing_graphics/index.md

Uses the 9-parameter drawImage() method to extract a specific sprite frame slice and draw it vertically centered at the current horizontal position.

```javascript
ctx.drawImage(
  image,
  0,
  spriteIndex * spriteHeight,
  spriteWidth,
  spriteHeight,
  0 + posX,
  -spriteHeight / 2,
  spriteWidth,
  spriteHeight,
);
```

--------------------------------

### Drawing waveform oscilloscope with getFloatTimeDomainData()

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/analysernode/getfloattimedomaindata/index.md

Collects time-domain data into a Float32Array matching fftSize and visualizes it onto a canvas inside a requestAnimationFrame loop.

```javascript
const audioCtx = new AudioContext();
const analyser = audioCtx.createAnalyser();

// …

analyser.fftSize = 1024;
const bufferLength = analyser.fftSize;
console.log(bufferLength);
const dataArray = new Float32Array(bufferLength);

canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

function draw() {
  drawVisual = requestAnimationFrame(draw);
  analyser.getFloatTimeDomainData(dataArray);

  canvasCtx.fillStyle = "rgb(200 200 200)";
  canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
  canvasCtx.lineWidth = 2;
  canvasCtx.strokeStyle = "rgb(0 0 0)";
  canvasCtx.beginPath();

  const sliceWidth = (WIDTH * 1.0) / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] * 200.0;
    const y = HEIGHT / 2 + v;

    if (i === 0) {
      canvasCtx.moveTo(x, y);
    } else {
      canvasCtx.lineTo(x, y);
    }
    x += sliceWidth;
  }

  canvasCtx.lineTo(canvas.width, canvas.height / 2);
  canvasCtx.stroke();
}

draw();
```
## C7: MDN 2D collision detection / gamepad
### Detect 2D axis-aligned bounding box collision

Source: https://github.com/mdn/content/blob/main/files/en-us/mdn/kitchensink/index.md

Checks for collision between two non-rotated rectangles by confirming there is no gap on any of the four sides.

```javascript
var rect1 = { x: 5, y: 5, width: 50, height: 50 };
var rect2 = { x: 20, y: 10, width: 10, height: 10 };

if (
  rect1.x < rect2.x + rect2.width &&
  rect1.x + rect1.width > rect2.x &&
  rect1.y < rect2.y + rect2.height &&
  rect1.y + rect1.height > rect2.y
) {
  // collision detected!
}

// filling in the values =>

if (5 < 30 && 55 > 20 && 5 < 20 && 55 > 10) {
  // collision detected!
}
```

--------------------------------

### Detect axis-aligned bounding box collision in BoxEntity

Source: https://github.com/mdn/content/blob/main/files/en-us/games/techniques/2d_collision_detection/index.md

Checks for overlap between two unrotated rectangles by verifying there is no gap across all four edges. Returns true when both horizontal and vertical bounds intersect.

```javascript
class BoxEntity extends BaseEntity {
  width = 20;
  height = 20;

  isCollidingWith(other) {
    return (
      this.position.x < other.position.x + other.width &&
      this.position.x + this.width > other.position.x &&
      this.position.y < other.position.y + other.height &&
      this.position.y + this.height > other.position.y
    );
  }
}
```

--------------------------------

### Perform collision tests with Box3

Source: https://github.com/mdn/content/blob/main/files/en-us/games/techniques/3d_collision_detection/bounding_volume_collision_detection_with_three.js/index.md

Performs collision detection using intersectsBox() to test against another Box3 instance or containsPoint() to check if a point lies within the bounding box volume.

```javascript
// box vs. box
box3.intersectsBox(otherBox3);
// box vs. point
box3.containsPoint(point.position);
```

--------------------------------

### Animate 2D bouncing balls using the Canvas API

Source: https://github.com/mdn/content/blob/main/files/en-us/learn_web_development/extensions/client-side_apis/drawing_graphics/index.md

Sets up an HTML canvas and runs a 2D animation loop that draws, moves, and checks collisions among bouncing balls. Requires a full-window HTML canvas container and uses requestAnimationFrame for continuous rendering.

```html
<h1>bouncing balls</h1>
<canvas></canvas>
```

```css
html,
body {
  margin: 0;
}

html {
  font-family: "Helvetica Neue", "Helvetica", "Arial", sans-serif;
  height: 100%;
}

body {
  overflow: hidden;
  height: inherit;
}

h1 {
  font-size: 2rem;
  letter-spacing: -1px;
  position: absolute;
  margin: 0;
  top: -4px;
  right: 5px;

  color: transparent;
  text-shadow: 0 0 4px white;
}
```

```javascript
// set up canvas

const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

const width = (canvas.width = window.innerWidth);
const height = (canvas.height = window.innerHeight);

// function to generate random number

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// function to generate random RGB color value

function randomRGB() {
  return `rgb(${random(0, 255)} ${random(0, 255)} ${random(0, 255)})`;
}

const balls = [];

class Ball {
  constructor(x, y, velX, velY, color, size) {
    this.x = x;
    this.y = y;
    this.velX = velX;
    this.velY = velY;
    this.color = color;
    this.size = size;
  }

  draw() {
    ctx.beginPath();
    ctx.fillStyle = this.color;
    ctx.arc(this.x, this.y, this.size, 0, 2 * Math.PI);
    ctx.fill();
  }

  update() {
    if (this.x + this.size >= width) {
      this.velX = -Math.abs(this.velX);
    }

    if (this.x - this.size <= 0) {
      this.velX = Math.abs(this.velX);
    }

    if (this.y + this.size >= height) {
      this.velY = -Math.abs(this.velY);
    }

    if (this.y - this.size <= 0) {
      this.velY = Math.abs(this.velY);
    }

    this.x += this.velX;
    this.y += this.velY;
  }

  collisionDetect() {
    for (const ball of balls) {
      if (!(this === ball)) {
        const dx = this.x - ball.x;
        const dy = this.y - ball.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.size + ball.size) {
          ball.color = this.color = randomRGB();
        }
      }
    }
  }
}

while (balls.length < 25) {
  const size = random(10, 20);
  const ball = new Ball(
    // ball position always drawn at least one ball width
    // away from the edge of the canvas, to avoid drawing errors
    random(0 + size, width - size),
    random(0 + size, height - size),
    random(-7, 7),
    random(-7, 7),
    randomRGB(),
    size,
  );

  balls.push(ball);
}

function loop() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillRect(0, 0, width, height);

  for (const ball of balls) {
    ball.draw();
    ball.update();
    ball.collisionDetect();
  }

  requestAnimationFrame(loop);
}

loop();
```

--------------------------------

### Implement interactive rectangle collision detection with Crafty.js

Source: https://github.com/mdn/content/blob/main/files/en-us/mdn/kitchensink/index.md

Sets up a Crafty.js canvas stage with a controllable blue rectangle that turns green upon colliding with a red rectangle.

```html
<div id="cr-stage"></div>
<p>
  Move the rectangle with arrow keys. Green means collision, blue means no
  collision.
</p>
<script src="https://cdnjs.cloudflare.com/ajax/libs/crafty/0.5.4/crafty-min.js"></script>
```

```javascript
Crafty.init(200, 200);

var dim1 = { x: 5, y: 5, w: 50, h: 50 };
var dim2 = { x: 20, y: 10, w: 60, h: 40 };

var rect1 = Crafty.e("2D, Canvas, Color").attr(dim1).color("red");

var rect2 = Crafty.e("2D, Canvas, Color, Keyboard, Fourway")
  .fourway(2)
  .attr(dim2)
  .color("blue");

rect2.bind("EnterFrame", function () {
  if (
    rect1.x > rect2.x + rect2.w &&
    rect1.x + rect1.w > rect2.x &&
    rect1.y > rect2.y + rect2.h &&
    rect1.h + rect1.y > rect2.y
  ) {
    // collision detected!
    this.color("green");
  } else {
    // no collision
    this.color("blue");
  }
});
```

--------------------------------

### IntersectionObserverEntry.boundingClientRect

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/intersectionobserverentry/boundingclientrect/index.md

Read-only property that returns a DOMRectReadOnly representing the bounding rectangle of the target element.

```APIDOC
## IntersectionObserverEntry.boundingClientRect

### Description
The `boundingClientRect` read-only property of the `IntersectionObserverEntry` interface returns a `DOMRectReadOnly` which describes the smallest rectangle that contains the entire target element.

### Property Value
- **Type**: `DOMRectReadOnly` (read-only)
- **Description**: A `DOMRectReadOnly` describing the smallest rectangle containing every part of the target element whose intersection change is being described, calculated using the same algorithm as `Element.getBoundingClientRect()`.
```

--------------------------------

### Check canvas boundaries and invert velocity vectors

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/canvas_api/tutorial/advanced_animations/index.md

Add these collision checks to the draw function to reverse the ball's velocity when it hits canvas boundaries.

```javascript
if (
  ball.y + ball.vy > canvas.height - ball.radius ||
  ball.y + ball.vy < ball.radius
) {
  ball.vy = -ball.vy;
}
if (
  ball.x + ball.vx > canvas.width - ball.radius ||
  ball.x + ball.vx < ball.radius
) {
  ball.vx = -ball.vx;
}
```

--------------------------------

### Align inline boxes along the inline axis with text-align

Source: https://github.com/mdn/content/blob/main/files/en-us/web/css/guides/inline_layout/inline_formatting_context/index.md

Aligns inline boxes within their line box when extra inline space is available. The text-align property positions inline content along the inline axis across different writing modes.

```html
<div class="example horizontal">One Two Three</div>
<div class="example vertical">Four Five Six</div>
```

```css
body {
  font: 1.2em sans-serif;
}

.example {
  border: 5px solid black;
  margin: 20px;
}

.horizontal {
  writing-mode: horizontal-tb;
}

.vertical {
  writing-mode: vertical-rl;
}
```

```css
.example {
  text-align: center;
  inline-size: 250px;
}
```

--------------------------------

### Account for ball radius in wall collision detection

Source: https://github.com/mdn/content/blob/main/files/en-us/games/tutorials/2d_breakout_game_pure_javascript/bounce_off_the_walls/index.md

Offset boundary collision checks by ballRadius so the ball bounces off its circumference rather than its center.

```javascript
if (x + dx > canvas.width - ballRadius || x + dx < ballRadius) {
  dx = -dx;
}
if (y + dy > canvas.height - ballRadius || y + dy < ballRadius) {
  dy = -dy;
}
```

--------------------------------

### Align inline boxes along the block axis with vertical-align

Source: https://github.com/mdn/content/blob/main/files/en-us/web/css/guides/inline_layout/inline_formatting_context/index.md

Aligns inline boxes within a line box along the block axis across horizontal and vertical writing modes. The vertical-align property shifts inline content relative to adjacent text regardless of writing mode orientation.

```html
<div class="example horizontal">
  Before that night—<span>a memorable night</span>, as it was to prove—hundreds
  of millions of people had watched the rising smoke-wreaths of their fires
  without drawing any special inspiration from the fact.
</div>

<div class="example vertical">
  Before that night—<span>a memorable night</span>, as it was to prove—hundreds
  of millions of people had watched the rising smoke-wreaths of their fires
  without drawing any special inspiration from the fact.
</div>
```

```css
body {
  font: 1.2em sans-serif;
}

span {
  font-size: 200%;
  vertical-align: top;
}

.example {
  border: 5px solid black;
  margin: 20px;
  inline-size: 400px;
}

.horizontal {
  writing-mode: horizontal-tb;
}

.vertical {
  writing-mode: vertical-rl;
}
```

--------------------------------

### Combine top and bottom boundary checks

Source: https://github.com/mdn/content/blob/main/files/en-us/games/tutorials/2d_breakout_game_pure_javascript/bounce_off_the_walls/index.md

Merge top and bottom edge collision detection into a single conditional statement.

```javascript
if (y + dy > canvas.height || y + dy < 0) {
  dy = -dy;
}
```

--------------------------------

### Complete 2D breakout game code with collision detection

Source: https://github.com/mdn/content/blob/main/files/en-us/games/tutorials/2d_breakout_game_pure_javascript/collision_detection/index.md

Complete HTML, CSS, and JavaScript implementation running the breakout game with brick collision detection and removal.

```html
<canvas id="myCanvas" width="480" height="320"></canvas>
<button id="runButton">Start game</button>
```

```css
canvas {
  background: #eeeeee;
}
button {
  display: block;
}
```

```js
const canvas = document.getElementById("myCanvas");
const ctx = canvas.getContext("2d");
const ballRadius = 10;

let x = canvas.width / 2;
let y = canvas.height - 30;
let dx = 2;
let dy = -2;

const paddleHeight = 10;
const paddleWidth = 75;

let paddleX = (canvas.width - paddleWidth) / 2;
let rightPressed = false;
let leftPressed = false;

let interval = 0;

const brickRowCount = 3;
const brickColumnCount = 5;
const brickWidth = 75;
const brickHeight = 20;
const brickPadding = 10;
const brickOffsetTop = 30;
const brickOffsetLeft = 30;

let bricks = [];
for (let c = 0; c < brickColumnCount; c++) {
  bricks[c] = [];
  for (let r = 0; r < brickRowCount; r++) {
    bricks[c][r] = { x: 0, y: 0, status: 1 };
  }
}

document.addEventListener("keydown", keyDownHandler);
document.addEventListener("keyup", keyUpHandler);

function keyDownHandler(e) {
  if (e.key === "Right" || e.key === "ArrowRight") {
    rightPressed = true;
  } else if (e.key === "Left" || e.key === "ArrowLeft") {
    leftPressed = true;
  }
}

function keyUpHandler(e) {
  if (e.key === "Right" || e.key === "ArrowRight") {
    rightPressed = false;
  } else if (e.key === "Left" || e.key === "ArrowLeft") {
    leftPressed = false;
  }
}
function collisionDetection() {
  for (let c = 0; c < brickColumnCount; c++) {
    for (let r = 0; r < brickRowCount; r++) {
      let b = bricks[c][r];
      if (b.status === 1) {
        if (
          x > b.x &&
          x < b.x + brickWidth &&
          y > b.y &&
          y < b.y + brickHeight
        ) {
          dy = -dy;
          b.status = 0;
        }
      }
    }
  }
}
function drawBall() {
  ctx.beginPath();
  ctx.arc(x, y, ballRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#0095DD";
  ctx.fill();
  ctx.closePath();
}
function drawPaddle() {
  ctx.beginPath();
  ctx.rect(paddleX, canvas.height - paddleHeight, paddleWidth, paddleHeight);
  ctx.fillStyle = "#0095DD";
  ctx.fill();
  ctx.closePath();
}
function drawBricks() {
  for (let c = 0; c < brickColumnCount; c++) {
    for (let r = 0; r < brickRowCount; r++) {
      if (bricks[c][r].status === 1) {
        let brickX = c * (brickWidth + brickPadding) + brickOffsetLeft;
        let brickY = r * (brickHeight + brickPadding) + brickOffsetTop;
        bricks[c][r].x = brickX;
        bricks[c][r].y = brickY;
        ctx.beginPath();
        ctx.rect(brickX, brickY, brickWidth, brickHeight);
        ctx.fillStyle = "#0095DD";
        ctx.fill();
        ctx.closePath();
      }
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBricks();
  drawBall();
  drawPaddle();
  collisionDetection();

  if (x + dx > canvas.width - ballRadius || x + dx < ballRadius) {
    dx = -dx;
  }
  if (y + dy < ballRadius) {
    dy = -dy;
  } else if (y + dy > canvas.height - ballRadius) {
    if (x > paddleX && x < paddleX + paddleWidth) {
      if ((y -= paddleHeight)) {
        dy = -dy;
      }
    } else {
      alert("GAME OVER");
      document.location.reload();
      clearInterval(interval);
    }
  }

  if (rightPressed && paddleX < canvas.width - paddleWidth) {
    paddleX += 7;
  } else if (leftPressed && paddleX > 0) {
    paddleX -= 7;
  }

  x += dx;
  y += dy;
}

function startGame() {
  interval = setInterval(draw, 10);
}

const runButton = document.getElementById("runButton");
runButton.addEventListener("click", () => {
  startGame();
  runButton.disabled = true;
});
```

--------------------------------

### Enable world bounds collision with setCollideWorldBounds

Source: https://github.com/mdn/content/blob/main/files/en-us/games/tutorials/2d_breakout_game_phaser/bounce_off_the_walls/index.md

Enables collision detection with the game world bounds for the ball's physics body, setting bounce factors of 1 on both x and y axes.

```javascript
this.ball.body.setCollideWorldBounds(true, 1, 1);
```

--------------------------------

### SVGGraphicsElement.getBBox()

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/svggraphicselement/index.md

Returns a DOMRect representing the computed bounding box of the current element.

```APIDOC
## SVGGraphicsElement.getBBox()

### Description
Returns a DOMRect representing the computed bounding box of the current element.

### Syntax
```javascript
element.getBBox()
```

### Return Value
- **DOMRect** - An object representing the computed bounding box of the element.
```

--------------------------------

### CanvasRenderingContext2D.textAlign

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/canvasrenderingcontext2d/textalign/index.md

Specifies the current text alignment used when drawing text on a 2D canvas context. Alignment is calculated relative to the x coordinate specified in drawing methods like fillText().

```APIDOC
## CanvasRenderingContext2D.textAlign

### Description
The `textAlign` property of the `CanvasRenderingContext2D` interface specifies the current text alignment used when drawing text.

### Syntax
```javascript
ctx.textAlign = value;
let currentAlign = ctx.textAlign;
```

### Value
A string representing the text alignment. The default value is `"start"`.

Possible values:
- `"left"`: The text is left-aligned.
- `"right"`: The text is right-aligned.
- `"center"`: The text is centered.
- `"start"`: The text is aligned at the normal start of the line (left-aligned for LTR locales, right-aligned for RTL locales).
- `"end"`: The text is aligned at the normal end of the line (right-aligned for LTR locales, left-aligned for RTL locales).

### Example
```javascript
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

ctx.font = "30px serif";
ctx.textAlign = "center";
ctx.fillText("Hello world", canvas.width / 2, 50);
```
```

--------------------------------

### Configure Arcade collision detection for ball and boundaries

Source: https://github.com/mdn/content/blob/main/files/en-us/games/tutorials/html5_gamedev_phaser_device_orientation/index.md

Registers collisions in the update() function between the ball, screen borders, and current level obstacles. Executes the wallCollision callback handler upon impact.

```js
this.physics.arcade.collide(
  this.ball,
  this.borderGroup,
  this.wallCollision,
  null,
  this,
);
this.physics.arcade.collide(
  this.ball,
  this.levels[this.level - 1],
  this.wallCollision,
  null,
  this,
);
```

--------------------------------

### PerformanceElementTiming.intersectionRect

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/performanceelementtiming/intersectionrect/index.md

Read-only property that returns the display rectangle of the element within the viewport as a DOMRectReadOnly object.

```APIDOC
## PerformanceElementTiming.intersectionRect

### Description
The `intersectionRect` read-only property of the `PerformanceElementTiming` interface returns the rectangle of the element within the viewport.

### Syntax
```javascript
const rect = performanceElementTimingInstance.intersectionRect;
```

### Value
A `DOMRectReadOnly` representing the rectangle of the element within the viewport:
- For display images, this is the display rectangle of the image within the viewport.
- For text, this is the display rectangle of the node in the viewport (the smallest rectangle containing the union of all text nodes belonging to the element).

### Example
```javascript
const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    if (entry.identifier === "big-image") {
      console.log(entry.intersectionRect);
    }
  });
});
observer.observe({ type: "element", buffered: true });
```
```

--------------------------------

### Complete paddle collision and game over implementation

Source: https://github.com/mdn/content/blob/main/files/en-us/games/tutorials/2d_breakout_game_pure_javascript/game_over/index.md

Runnable breakout game example combining the HTML canvas and start button, styling, and game loop logic with paddle collision detection and game over states.

```html
<canvas id="myCanvas" width="480" height="320"></canvas>
<button id="runButton">Start game</button>
```

```css
canvas {
  background: #eeeeee;
}
button {
  display: block;
}
```

```javascript
const canvas = document.getElementById("myCanvas");
const ctx = canvas.getContext("2d");
const ballRadius = 10;

let x = canvas.width / 2;
let y = canvas.height - 30;
let dx = 2;
let dy = -2;

const paddleHeight = 10;
const paddleWidth = 75;

let paddleX = (canvas.width - paddleWidth) / 2;
let rightPressed = false;
let leftPressed = false;

let interval = 0;

document.addEventListener("keydown", keyDownHandler);
document.addEventListener("keyup", keyUpHandler);

function keyDownHandler(e) {
  if (e.key === "Right" || e.key === "ArrowRight") {
    rightPressed = true;
  } else if (e.key === "Left" || e.key === "ArrowLeft") {
    leftPressed = true;
  }
}

function keyUpHandler(e) {
  if (e.key === "Right" || e.key === "ArrowRight") {
    rightPressed = false;
  } else if (e.key === "Left" || e.key === "ArrowLeft") {
    leftPressed = false;
  }
}

function drawBall() {
  ctx.beginPath();
  ctx.arc(x, y, ballRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#0095DD";
  ctx.fill();
  ctx.closePath();
}
function drawPaddle() {
  ctx.beginPath();
  ctx.rect(paddleX, canvas.height - paddleHeight, paddleWidth, paddleHeight);
  ctx.fillStyle = "#0095DD";
  ctx.fill();
  ctx.closePath();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBall();
  drawPaddle();

  if (x + dx > canvas.width - ballRadius || x + dx < ballRadius) {
    dx = -dx;
  }
  if (y + dy < ballRadius) {
    dy = -dy;
  } else if (y + dy > canvas.height - ballRadius) {
    if (x > paddleX && x < paddleX + paddleWidth) {
      dy = -dy;
    } else {
      alert("GAME OVER");
      document.location.reload();
      clearInterval(interval); // Needed for Chrome to end game
    }
  }

  if (rightPressed && paddleX < canvas.width - paddleWidth) {
    paddleX += 7;
  } else if (leftPressed && paddleX > 0) {
    paddleX -= 7;
  }

  x += dx;
  y += dy;
}

function startGame() {
  interval = setInterval(draw, 10);
}

const runButton = document.getElementById("runButton");
runButton.addEventListener("click", () => {
  startGame();
  runButton.disabled = true;
});
```
## C7: MDN audio web audio api
### Connecting an AudioNode to another AudioNode

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/audionode/connect/index.md

Directs the audio output from an oscillator node into a gain node, which in turn connects to the audio context destination to play sound.

```javascript
const audioCtx = new AudioContext();

const oscillator = audioCtx.createOscillator();
const gainNode = audioCtx.createGain();

oscillator.connect(gainNode);
gainNode.connect(audioCtx.destination);
```

--------------------------------

### Creating and connecting audio nodes with AudioNode

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/audionode/index.md

Instantiates an AudioContext along with oscillator and gain nodes, chains their connections to the audio destination, and accesses common AudioNode properties.

```javascript
const audioCtx = new AudioContext();

const oscillator = new OscillatorNode(audioCtx);
const gainNode = new GainNode(audioCtx);

oscillator.connect(gainNode).connect(audioCtx.destination);

oscillator.context;
oscillator.numberOfInputs;
oscillator.numberOfOutputs;
oscillator.channelCount;
```

--------------------------------

### BaseAudioContext.prototype.createGain()

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/baseaudiocontext/creategain/index.md

Creates a GainNode used to control the overall gain (or volume) of the audio graph. The node takes one or more audio sources and outputs adjusted audio based on its gain parameter.

```APIDOC
## BaseAudioContext.prototype.createGain()

### Description
The `createGain()` method of the `BaseAudioContext` interface creates a `GainNode`, which can be used to control the overall gain (or volume) of the audio graph.

### Syntax
```javascript
createGain()
```

### Parameters
None.

### Return Value
- **GainNode** - A `GainNode` which takes as input one or more audio sources and outputs audio whose volume has been adjusted in gain (volume) to a level specified by the node's `gain` parameter.

### Example
```javascript
const audioCtx = new AudioContext();
const gainNode = audioCtx.createGain();

// Adjust the gain value (0 is mute, 1 is normal volume)
gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
```
```

--------------------------------

### Creating audio nodes with BaseAudioContext

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/baseaudiocontext/index.md

Create an AudioContext instance along with an oscillator node, a gain node, and a reference to the audio destination.

```javascript
const audioContext = new AudioContext();

const oscillatorNode = audioContext.createOscillator();
const gainNode = audioContext.createGain();
const finish = audioContext.destination;
```

--------------------------------

### Configure AudioContext, GainNodes, and ConstantSourceNode in setup()

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/web_audio_api/controlling_multiple_parameters_with_constantsourcenode/index.md

Instantiates the AudioContext and gain nodes, then links gainNode2 and gainNode3 gain parameters to a single ConstantSourceNode. Starts the constant node and connects all gain outputs to the audio destination.

```javascript
function setup() {
  context = new AudioContext();

  gainNode1 = new GainNode(context, {
    gain: 0.5,
  });
  gainNode2 = new GainNode(context, {
    gain: gainNode1.gain.value,
  });
  gainNode3 = new GainNode(context, {
    gain: gainNode1.gain.value,
  });

  volumeControl.value = gainNode1.gain.value;

  constantNode = new ConstantSourceNode(context, {
    offset: volumeControl.value,
  });
  constantNode.connect(gainNode2.gain);
  constantNode.connect(gainNode3.gain);
  constantNode.start();

  gainNode1.connect(context.destination);
  gainNode2.connect(context.destination);
  gainNode3.connect(context.destination);

  // All is set up. We can hook the volume control.
  volumeControl.addEventListener("input", changeVolume);
}
```

--------------------------------

### GainNode()

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/gainnode/index.md

Creates and returns a new GainNode object. A GainNode applies a gain value to incoming audio data before sending it to the output.

```APIDOC
## Constructor: GainNode()

### Description
Creates and returns a new `GainNode` object. Alternatively, you can use the `BaseAudioContext.createGain()` factory method.

### Properties
- **gain** (`AudioParam`, Read-Only) - An a-rate `AudioParam` representing the amount of gain to apply. Set `AudioParam.value` or use `AudioParam` interpolation methods to modify the gain without introducing clicks.
```

--------------------------------

### Disconnect an AudioNode from its destinations

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/audionode/disconnect/index.md

Creates an oscillator and gain node, connects them to the audio context destination, and then disconnects all outgoing connections from the gain node.

```javascript
const audioCtx = new AudioContext();

const oscillator = audioCtx.createOscillator();
const gainNode = audioCtx.createGain();

oscillator.connect(gainNode);
gainNode.connect(audioCtx.destination);

gainNode.disconnect();
```

--------------------------------

### BaseAudioContext.prototype.createGain()

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/baseaudiocontext/index.md

Creates a GainNode used to control overall volume and signal attenuation in an audio graph.

```APIDOC
## BaseAudioContext.prototype.createGain()

### Description
Creates a GainNode, which can be used to control the overall volume of the audio graph.

### Syntax
```javascript
baseAudioContext.createGain();
```

### Return Value
- **GainNode** - A new gain node.
```

--------------------------------

### new GainNode(context, options)

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/gainnode/gainnode/index.md

Creates a new GainNode object instance which is an AudioNode that represents a change in volume.

```APIDOC
## new GainNode(context, options)

### Description
Creates a new `GainNode` object instance which represents a change in volume in an audio processing graph.

### Syntax
```javascript
new GainNode(context, options)
```

### Parameters
- **context** (`BaseAudioContext`) - Required - A reference to an audio context, such as an `AudioContext`.
- **options** (`Object`) - Optional - An object options dictionary:
  - **gain** (`number`) - Optional - The amount of gain to apply. Nominal range is `(-∞, +∞)`. Default is `1`.
  - **channelCount** (`integer`) - Optional - An integer used to determine how many channels are used when up-mixing and down-mixing connections to any inputs.
  - **channelCountMode** (`string`) - Optional - An enumerated value describing the way channels must be matched between the node's inputs and outputs.
  - **channelInterpretation** (`string`) - Optional - An enumerated value describing the meaning of the channels (`"speakers"` or `"discrete"`).

### Return Value
A new `GainNode` object instance.
```

--------------------------------

### Create a media element source node from an audio element

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/web_audio_api/web_audio_spatialization_basics/index.md

Defines an HTML audio element and routes its audio into the Web Audio API using AudioContext.createMediaElementSource().

```html
<audio src="myCoolTrack.mp3"></audio>
```

```javascript
// get the audio element
const audioElement = document.querySelector("audio");

// pass it into the audio context
const track = audioContext.createMediaElementSource(audioElement);
```

--------------------------------

### Connecting an AudioNode to an AudioParam

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/audionode/connect/index.md

Connects an LFO oscillator directly to a GainNode's gain AudioParam to modulate its value dynamically over time.

```javascript
const audioCtx = new AudioContext();

// create a normal oscillator to make sound
const oscillator = audioCtx.createOscillator();

// create a second oscillator that will be used as an LFO (Low-frequency
// oscillator), and will control a parameter
const lfo = audioCtx.createOscillator();

// set the frequency of the second oscillator to a low number
lfo.frequency.value = 2.0; // 2Hz: two oscillations per second

// create a gain whose gain AudioParam will be controlled by the LFO
const gain = audioCtx.createGain();

// connect the LFO to the gain AudioParam. This means the value of the LFO
// will not produce any audio, but will change the value of the gain instead
lfo.connect(gain.gain);

// connect the oscillator that will produce audio to the gain
oscillator.connect(gain);

// connect the gain to the destination so we hear sound
gain.connect(audioCtx.destination);

// start the oscillator that will produce audio
oscillator.start();

// start the oscillator that will modify the gain value
lfo.start();
```

--------------------------------

### Connecting an audio graph to BaseAudioContext.destination

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/baseaudiocontext/destination/index.md

Demonstrates creating an AudioContext, connecting an oscillator to a gain node, and routing the output to the destination node.

```javascript
const audioCtx = new AudioContext();
// Older webkit/blink browsers require a prefix

const oscillatorNode = audioCtx.createOscillator();
const gainNode = audioCtx.createGain();

oscillatorNode.connect(gainNode);
gainNode.connect(audioCtx.destination);
```

--------------------------------

### Initialize keyboard UI and audio nodes with setup()

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/web_audio_api/simple_synth/index.md

Constructs the virtual keyboard interface, connects the master gain node to audioContext.destination, generates a custom periodic waveform, and initializes oscillator tracking.

```javascript
function setup() {
  const noteFreq = createNoteTable();

  volumeControl.addEventListener("change", changeVolume);

  mainGainNode = audioContext.createGain();
  mainGainNode.connect(audioContext.destination);
  mainGainNode.gain.value = volumeControl.value;

  // Create the keys; skip any that are sharp or flat; for
  // our purposes we don't need them. Each octave is inserted
  // into a <div> of class "octave".

  noteFreq.forEach((keys, idx) => {
    const keyList = Object.entries(keys);
    const octaveElem = document.createElement("div");
    octaveElem.className = "octave";

    keyList.forEach((key) => {
      if (key[0].length === 1) {
        octaveElem.appendChild(createKey(key[0], idx, key[1]));
      }
    });

    keyboard.appendChild(octaveElem);
  });

  document
    .querySelector("div[data-note='B'][data-octave='5']")
    .scrollIntoView(false);

  sineTerms = new Float32Array([0, 0, 1, 0, 1]);
  cosineTerms = new Float32Array(sineTerms.length);
  customWaveform = audioContext.createPeriodicWave(cosineTerms, sineTerms);

  for (let i = 0; i < 9; i++) {
    oscList[i] = {};
  }
}

setup();
```

--------------------------------

### Declare global variables for UI elements and audio nodes

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/web_audio_api/controlling_multiple_parameters_with_constantsourcenode/index.md

Initializes references to DOM control elements as well as placeholder variables for the AudioContext, oscillators, gain nodes, and the ConstantSourceNode before user interaction.

```javascript
// Useful UI elements
const playButton = document.querySelector("#playButton");
const volumeControl = document.querySelector("#volumeControl");

// The audio context and the node will be initialized after the first request
let context = null;
let oscNode1 = null;
let oscNode2 = null;
let oscNode3 = null;
let constantNode = null;
let gainNode1 = null;
let gainNode2 = null;
let gainNode3 = null;
```

--------------------------------

### new OscillatorNode(context, options)

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/oscillatornode/oscillatornode/index.md

Constructs a new OscillatorNode object instance associated with an AudioContext, with optional property settings such as waveform type, detune, frequency, and channel configuration.

```APIDOC
### Constructor

`new OscillatorNode(context, options)`

### Description
Creates a new `OscillatorNode` object which is an `AudioNode` that represents a periodic waveform, like a sine wave, optionally setting the node's initial property values.

### Parameters

- **context** (`AudioContext`) - *Required* - A reference to an `AudioContext`.
- **options** (`object`) - *Optional* - An object whose properties specify the initial values for the oscillator node's properties:
  - **type** (`string`) - *Optional* - The shape of the wave produced by the node (`"sine"`, `"square"`, `"sawtooth"`, `"triangle"`, `"custom"`). Default is `"sine"`.
  - **detune** (`number`) - *Optional* - A detuning value in cents offsetting `frequency`. Default is `0`.
  - **frequency** (`number`) - *Optional* - The frequency in hertz of the periodic waveform. Default is `440`.
  - **periodicWave** (`PeriodicWave`) - *Optional* - An arbitrary periodic waveform described by a `PeriodicWave` object.
  - **channelCount** (`integer`) - *Optional* - An integer used to determine how many channels are used for up-mixing and down-mixing.
  - **channelCountMode** (`string`) - *Optional* - An enumerated value describing the way channels must be matched between the node's inputs and outputs.
  - **channelInterpretation** (`string`) - *Optional* - An enumerated value (`"speakers"` or `"discrete"`) describing the meaning of the channels for up-mixing and down-mixing.

### Return Value

- **OscillatorNode** - A new `OscillatorNode` object instance.
```

--------------------------------

### Access AudioParam.maxValue on a GainNode

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/audioparam/maxvalue/index.md

Create an AudioContext and GainNode to retrieve and log the maxValue property of its gain AudioParam.

```javascript
const audioCtx = new AudioContext();
const gainNode = audioCtx.createGain();
console.log(gainNode.gain.maxValue); // 3.4028234663852886e38
```

--------------------------------

### Connect audio nodes in graph sequence

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/web_audio_api/using_web_audio_api/index.md

Chains the audio track through the gain node and stereo panner node to the AudioContext destination.

```javascript
track.connect(gainNode).connect(panner).connect(audioContext.destination);
```

--------------------------------

### Create and play an OscillatorNode with AudioContext

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/baseaudiocontext/createoscillator/index.md

Creates an OscillatorNode using AudioContext.createOscillator(), configures a square waveform and frequency, connects it to the audio destination, and starts tone playback.

```javascript
// create web audio api context
const audioCtx = new AudioContext();

// create Oscillator node
const oscillator = audioCtx.createOscillator();

oscillator.type = "square";
oscillator.frequency.setValueAtTime(3000, audioCtx.currentTime); // value in hertz
oscillator.connect(audioCtx.destination);
oscillator.start();
```
## C7: MDN touch pointer events
### Handle pointerdown event to start drawing

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/pointer_events/using_pointer_events/index.md

Registers a pointerdown event listener that records initial pointer positions and draws a starting dot on the canvas.

```javascript
function handleStart(event) {
  const touch = {
    pageX: event.pageX,
    pageY: event.pageY,
    color: colors[ongoingTouches.size % colors.length],
  };
  ongoingTouches.set(event.pointerId, touch);

  ctx.beginPath();
  ctx.arc(touch.pageX, touch.pageY, 4, 0, 2 * Math.PI, false);
  ctx.fillStyle = touch.color;
  ctx.fill();
}

canvas.addEventListener("pointerdown", handleStart);
```

--------------------------------

### Handle touchstart events for multi-touch gestures

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/touch_events/multi-touch_interaction/index.md

Caches touch points when two target touches are detected to support 2-touch gestures. Calls preventDefault() to prevent additional browser handling such as mouse emulation.

```javascript
function startHandler(ev) {
  // If the user makes simultaneous touches, the browser will fire a
  // separate touchstart event for each touch point. Thus if there are
  // three simultaneous touches, the first touchstart event will have
  // targetTouches length of one, the second event will have a length
  // of two, and so on.
  ev.preventDefault();
  // Cache the touch points for later processing of 2-touch pinch/zoom
  if (ev.targetTouches.length === 2) {
    for (const touch of ev.targetTouches) {
      tpCache.push(touch);
    }
  }
  if (logEvents) log("touchStart", ev, true);
  updateBackground(ev);
}
```

--------------------------------

### Drawing predicted pointer events on a canvas

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/pointerevent/getpredictedevents/index.md

Uses getPredictedEvents() in a pointermove event handler to render both actual and predicted future pointer positions on a canvas.

```html
<canvas id="target" width="600" height="300"></canvas>
```

```javascript
const canvas = document.getElementById("target");
const ctx = canvas.getContext("2d");

const pointerEvents = [];

function drawCircle(x, y, color) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw the last 20 events
  if (pointerEvents.length > 20) {
    pointerEvents.shift();
  }
  pointerEvents.push({ x, y, color });

  for (const pointerEvent of pointerEvents) {
    ctx.beginPath();
    ctx.arc(pointerEvent.x, pointerEvent.y, 10, 0, 2 * Math.PI);
    ctx.strokeStyle = pointerEvent.color;
    ctx.stroke();
  }
}

canvas.addEventListener("pointermove", (e) => {
  // draw a circle for the current event
  drawCircle(e.clientX, e.clientY, "black");

  const predictedEvents = e.getPredictedEvents();
  for (let predictedEvent of predictedEvents) {
    // give it an offset so we can see the difference and color it red
    drawCircle(predictedEvent.clientX + 20, predictedEvent.clientY + 20, "red");
  }
});
```

--------------------------------

### Element: touchend event

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/element/touchend_event/index.md

Fires when one or more touch points are removed from the touch surface. Handled using addEventListener("touchend", handler) or the ontouchend event handler property.

```APIDOC
## Element: touchend event

### Description
The `touchend` event fires when one or more touch points are removed from the touch surface. It is possible to get a `touchcancel` event instead under certain conditions.

### Syntax
```javascript
addEventListener("touchend", (event) => { });

ontouchend = (event) => { };
```

### Event Type
A `TouchEvent`. Inherits from `Event`.

### Event Handler Properties
- **ontouchend** - An event handler property on the element or window.
```

--------------------------------

### Handling pointer events based on pointerType

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/pointerevent/pointertype/index.md

Uses the pointerType property within a pointerdown event listener to route processing to specific functions for mouse, pen, and touch inputs.

```javascript
targetElement.addEventListener("pointerdown", (event) => {
  // Call the appropriate pointer type handler
  switch (event.pointerType) {
    case "mouse":
      process_pointer_mouse(event);
      break;
    case "pen":
      process_pointer_pen(event);
      break;
    case "touch":
      process_pointer_touch(event);
      break;
    default:
      console.log(`pointerType ${event.pointerType} is not supported`);
  }
});
```

--------------------------------

### Accessing Touch.target from targetTouches in touchstart listener

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/touch/target/index.md

Iterates through the touch points activated on a target element during a touchstart event to access each touch's target property.

```javascript
// Register a touchmove listener for the 'source' element
const src = document.getElementById("source");

src.addEventListener("touchstart", (e) => {
  // Iterate through the touch points that were activated
  // for this element.
  for (let i = 0; i < e.targetTouches.length; i++) {
    console.log(`touchpoint[${i}].target = ${e.targetTouches[i].target}`);
  }
});
```

--------------------------------

### Handle touchmove events and 2-touch gestures

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/touch_events/multi-touch_interaction/index.md

Sets the target border to dashed to visually indicate movement and delegates 2-touch gestures to handlePinchZoom(). Skips background color updates when two touch points are active to prevent flashing.

```javascript
function moveHandler(ev) {
  // Note: if the user makes more than one "simultaneous" touches, most browsers
  // fire at least one touchmove event and some will fire several touch moves.
  // Consequently, an application might want to "ignore" some touch moves.
  //
  // This function sets the target element's border to "dashed" to visually
  // indicate the target received a move event.
  //
  ev.preventDefault();
  if (logEvents) log("touchMove", ev, false);
  // To avoid too much color flashing many touchmove events are started,
  // don't update the background if two touch points are active
  if (!(ev.touches.length === 2 && ev.targetTouches.length === 2))
    updateBackground(ev);

  // Set the target element's border to dashed to give a clear visual
  // indication the element received a move event.
  ev.target.style.border = "dashed";

  // Check this event for 2-touch Move/Pinch/Zoom gesture
  handlePinchZoom(ev);
}
```

--------------------------------

### Handle pointermove events with onpointermove

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/element/pointermove_event/index.md

Assigns an event handler directly to an element's onpointermove property to handle pointer movement events.

```javascript
const para = document.querySelector("p");

para.onpointermove = (event) => {
  console.log("Pointer moved");
};
```

--------------------------------

### Access touch point attributes

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/touch_events/using_touch_events/index.md

Iterates over the targetTouches collection to inspect individual touch points and process their target elements.

```javascript
// Create touchstart handler
someElement.addEventListener("touchstart", (event) => {
  // Iterate through the touch points that were activated
  // for this element and process each event 'target'
  for (const touch of event.targetTouches) {
    processTarget(touch.target);
  }
});
```

--------------------------------

### Accessing and drawing coalesced events on a canvas

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/pointerevent/getcoalescedevents/index.md

Listen to the pointermove event on a canvas to retrieve and render both the main event and all coalesced movement points.

```html
<canvas id="target" width="600" height="300"></canvas>
```

```javascript
const canvas = document.getElementById("target");
const ctx = canvas.getContext("2d");

const pointerEvents = [];

function drawCircle(x, y, color) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw the last 20 events
  if (pointerEvents.length > 20) {
    pointerEvents.shift();
  }
  pointerEvents.push({ x, y, color });

  for (const pointerEvent of pointerEvents) {
    ctx.beginPath();
    ctx.arc(pointerEvent.x, pointerEvent.y, 10, 0, 2 * Math.PI);
    ctx.strokeStyle = pointerEvent.color;
    ctx.stroke();
  }
}

canvas.addEventListener("pointermove", (e) => {
  // draw a circle for the current event
  drawCircle(e.clientX, e.clientY, "black");

  const coalescedEvents = e.getCoalescedEvents();
  for (let coalescedEvent of coalescedEvents) {
    // give it an offset so we can see the difference and color it red
    drawCircle(coalescedEvent.clientX + 20, coalescedEvent.clientY + 20, "red");
  }
});
```

--------------------------------

### Handling primary and secondary pointer events with isPrimary

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/pointerevent/isprimary/index.md

Evaluates `event.isPrimary` during a `pointerdown` event to route logic to either a primary or secondary pointer handler.

```javascript
target.addEventListener("pointerdown", (event) => {
  if (event.isPrimary) {
    process_primary_pointer(event);
  } else {
    process_secondary_pointer(event);
  }
});
```

--------------------------------

### Initialize canvas context and touch tracking map

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/pointer_events/using_pointer_events/index.md

Sets up 2D rendering context and a Map keyed by pointerId to track concurrent pointer inputs.

```javascript
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Mapping from the pointerId to the current finger position
const ongoingTouches = new Map();
const colors = ["red", "green", "blue"];
```

--------------------------------

### InputDeviceCapabilities.prototype.firesTouchEvents

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/inputdevicecapabilities/firestouchevents/index.md

The firesTouchEvents read-only property of the InputDeviceCapabilities interface returns a boolean indicating whether the input device dispatches touch events. This helps distinguish whether an event might represent an action already handled by touch listeners.

```APIDOC
## InputDeviceCapabilities.prototype.firesTouchEvents

### Description
The `firesTouchEvents` read-only property of the `InputDeviceCapabilities` interface returns a boolean value that indicates whether the device dispatches touch events.

### Property Value
- **Type**: `Boolean`
- **Read-only**: `true`

### Usage Example
```javascript
myButton.addEventListener("mousedown", (e) => {
  if (!e.sourceCapabilities.firesTouchEvents) {
    myButton.classList.add("pressed");
  }
});
```
```

--------------------------------

### Disable default touch gestures on the canvas

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/pointer_events/using_pointer_events/index.md

Sets touch-action to none to prevent default browser touch gestures from interfering with canvas interactions.

```css
#canvas {
  border: solid black 1px;
  touch-action: none;
  display: block;
}
```

--------------------------------

### Access Touch.pageX and Touch.pageY on touchmove events

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/touch/pagey/index.md

Registers a touchmove event listener on an element and iterates through the event's changedTouches list to log horizontal and vertical touch coordinates in CSS pixels.

```javascript
// Register a touchmove listeners for the 'source' element
const src = document.getElementById("source");

src.addEventListener("touchmove", (e) => {
  // Iterate through the touch points that have moved and log each
  // of the pageX/Y coordinates. The unit of each coordinate is CSS pixels.
  for (let i = 0; i < e.changedTouches.length; i++) {
    console.log(`touchpoint[${i}].pageX = ${e.changedTouches[i].pageX}`);
    console.log(`touchpoint[${i}].pageY = ${e.changedTouches[i].pageY}`);
  }
});
```

--------------------------------

### Handling canceled touches with touchcancel

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/touch_events/index.md

Aborts ongoing touches by removing their identifiers from the ongoing touch map when a touchcancel event is triggered. Prevents the default browser action without drawing a final line segment.

```javascript
function handleCancel(event) {
  event.preventDefault();

  for (const changedTouch of event.changedTouches) {
    if (!ongoingTouches.has(changedTouch.identifier)) {
      console.error(`Cancel: Could not find touch ${changedTouch.identifier}`);
      continue;
    }
    ongoingTouches.delete(changedTouch.identifier);
  }
}

canvas.addEventListener("touchcancel", handleCancel);
```

--------------------------------

### Handle pointercancel event to abort tracking

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/pointer_events/using_pointer_events/index.md

Removes cancelled pointer interactions from active tracking when interrupted by system events.

```javascript
function handleCancel(event) {
  const touch = ongoingTouches.get(event.pointerId);

  if (!touch) {
    console.error(`Cancel: Could not find touch ${event.pointerId}`);
    return;
  }

  ongoingTouches.delete(event.pointerId);
}

canvas.addEventListener("pointercancel", handleCancel);
```

--------------------------------

### Listen for pointer lock changes using pointerlockchange event

Source: https://github.com/mdn/content/blob/main/files/en-us/web/api/pointer_lock_api/index.md

Attaches a listener to the document to handle pointer lock state transitions.

```javascript
document.addEventListener("pointerlockchange", lockChangeAlert);
```