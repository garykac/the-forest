/* The Forest
 * 64x64 pixel game for Low Rez Jam 2016 - https://itch.io/jam/lowrezjam2016
 *
 * garykac@gmail.com
 */

/* Globals
 * Err, I mean, a singleton object containing game state.
 */
var g = {
	width: 64,
	height: 64,

	player_x: 352,
	player_y: 352,

	dx: 0,
	dy: 0,

	// Image for title screen.
	title: null,

	// Current game state: title, play, gameover_win, gameover_lose
	state: 'title',

	player_val: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
	player_anim_time: 0,
	player_anim_time_max: 18,

	// Map image rendered on screen.
	map: null,
	map_width: 640,
	map_height: 640,

	// Map rendered into offscreen canvas so it is easier to look at pixels.
	map_canvas: null,
	map_data: null,

	health: 16,
	// Amount that health decays each time the countdown timer triggers.
	health_decay: 0.25,
	health_timer: 0,
	health_timer_trigger: 100,

	// Gameover win/lose images.
	win: null,
	lose: null,

	// Array of light bitmaps.
	light: [],

	// Blob bitmap.
	blob: null,
	blobs: [],
	blob_mode: 'attack',
	blob_timer: 0,

	// Crystal bitmap.
	crystal: null,
	// Crystal locations.
	crystals: [],

	// Shadow lookup tables.
	shadow: [],
	shadow_threshold: 32,
	background_image: 'bg20.png',

	// Keyboard handling.
	keymap: {},
	valid_keys: {
		'ArrowUp':1, 'ArrowDown':1, 'ArrowLeft':1, 'ArrowRight':1,
		'KeyW':1, 'KeyA':1, 'KeyS':1, 'KeyD':1,
	},

	objects: [
		// [name, image, filename, x, y]
		['key', null, 'key.png', 210, 435],
	],

	// Used to initialize the blobs array.
	blob_init: [
		[495, 66],
		[126, 81],
		[323, 81],
		[265, 174],
		[472, 201],
		[139, 225],
		[397, 241],
		[211, 279],
		[331, 318],
		[522, 334],
		[285, 351],
		[134, 400],
		[258, 481],
		[94, 502],
		[479, 531],
	],

	// Used to initialize the |crystals| array.
	crystals_init: [
		[50, 50],
		[500, 125],
		[253, 131],
		[468, 258],
		[285, 285],
		[56, 386],
		[586, 397],
		[492, 467],
		[366, 516],
		[119, 586],
	],
};

var init = function() {
	window.addEventListener('load', onload);
	window.addEventListener('keydown', onkeydown);
	window.addEventListener('keyup', onkeyup);

	load_images();

	precalc_shadow_tables();

	init_blobs();
	init_crystals();
}

var onload = function() {
	window.requestAnimationFrame(gameloop);
}

var onkeydown = function(e) {
	if (g.state == 'title') {
		g.state = 'play';
	}

	if (!g.valid_keys.hasOwnProperty(e.code)) {
		return true;
	}

	e.stopImmediatePropagation();
	g.keymap[e.code] = true;
	update_dir();
	return false;
}

var onkeyup = function(e) {
	if (!g.valid_keys.hasOwnProperty(e.code)) {
		return true;
	}

	e.stopImmediatePropagation();
	g.keymap[e.code] = false;
	update_dir();
	return false;
}

var update_dir = function() {
	var speed = 0.4;

	var left = g.keymap['ArrowLeft'] || g.keymap['KeyA'];
	var right = g.keymap['ArrowRight'] || g.keymap['KeyD'];
	g.dx = (right ? speed : 0) - (left ? speed : 0);

	var up = g.keymap['ArrowUp'] || g.keymap['KeyW'];
	var down = g.keymap['ArrowDown'] || g.keymap['KeyS'];
	g.dy = (down ? speed : 0) - (up ? speed : 0);
}

var load_images = function() {
	g.title = new Image();
	g.title.src = 'title.png';

	g.map = new Image();
	g.map.addEventListener('load', function() {
		g.map_canvas = document.createElement("canvas");
		g.map_canvas.width = g.map.width;
		g.map_canvas.height = g.map.height;
		var ctx = g.map_canvas.getContext("2d");
		ctx.drawImage(g.map, 0, 0);
		g.map_data = ctx.getImageData(0, 0, g.map.width, g.map.height);
	}, false);
	g.map.src = "map.png";

	g.background = new Image();
	g.background.src = g.background_image;

	for (var i = 0; i <= 32; i+=2) {
		var img = new Image();
		img.src = 'light' + i + '.png';
		g.light.push(img);
	}

	g.blob = new Image();
	g.blob.src = 'blob.png';

	g.crystal = new Image();
	g.crystal.src = 'crystal_blue.png';

	for (var o of g.objects) {
		// [name, image, filename, x, y]
		o[1] = new Image();
		o[1].src = o[2];
	}

	g.win = new Image();
	g.win.src = 'win.png';
	g.lose = new Image();
	g.lose.src = 'lose.png';

}

// Calc shadow casts from (0,0) to pixel (x,y).
// Assume each pixel is a circle and the min/max angles of the shadow are
// determined by lines through (0,0) that are tangent to the circle at
// P2a and P2b.
//
//                     /
//                 +-------------+
//                 | / #######   |      Row 2:            +1,+2
//              P2b|+########### |
//                 |##### + #####|  /
//                /| #### P2 ### |
//                 |   #######  +|P2a
//   +----------/--+-------------+
//   |             |        /    |      Row 1: +0,+1      +1,+1
//   |        /    |             |
//   |             |    /        |
//   |      /      |             |
//   |             |/            |
//   +----/--------+-------------+
//   |          /  |                    Row 0: +0,+0
//   |  /          |
//   |      /      |
//   |/            |
//   |  /          |
//   +-------------+
// P1(0,0)
//
// The start and end angle for the shadow cast by each pixel is recorded.
// Start angle = Angle determined by x-axis and P1-P2a
// End angle = Angle determined by x-axis and P1-P2b
// Start/end angle are rounded to nearest int.
//
// Only the portion of the circle from 45-90 degrees (from 12:00 - 1:30 on a
// clock) is defined. The other 7 parts of a complete circle are
// mirrored/rotated from this one.
var precalc_shadow_tables = function() {
	var rad2deg = 180.0 / 3.14159265358979;
	for (var y = 0; y < 32; y++) {
		for (var x = 0; x <= y; x++) {
			// Center of circle is center of pixel.
			var p2x = x + 0.5;
			var p2y = y + 0.5;
			// alpha = angle defined by x-axis and P1-P2, from 45-90 deg.
			var alpha = Math.atan2(p2y, p2x) * rad2deg;
			// dist = hypotenuse of P2-P2a-P1 right triangle.
			var dist = Math.sqrt(p2x * p2x + p2y * p2y);
			// theta = the extra angle to left/right of alpha defining the
			// extent of the shaded area.
			var theta = Math.asin(0.5 / dist) * rad2deg;
			// alpha +/- theta is extent of shadow cast by this pixel.
			var min = Math.round(alpha-theta);
			if (min < 45)
				min = 45;
			var max = Math.round(alpha+theta);
			// Store 45-90 as 0-45, so we can use values directly as index into
			// shade angle table.
			g.shadow.push([x, y, min-45, max-45]);
		}
	}
}

var init_blobs = function() {
	for (var b of g.blob_init) {
		g.blobs.push([
			// 0: [x, y] - starting x,y position
			[b[0], b[1]],
			// 1: [x, y] - current x,y position (when active)
			[b[0], b[1]],
			// 2: active?
			false,
		]);
	}
}

var init_crystals = function() {
	for (var c of g.crystals_init) {
		g.crystals.push([
			// 0: [x, y] - position
			[c[0], c[1]],
			// 1: draw - true if not yet found
			true,
			// 2: [anim_val_start, anim_val_end, anim_val_upd, anim_val_curr]
			[0.6, 1.0, 0.05, 0.5],
			// 3: [anim_time, anim_time_counter]
			[8, 0],
		]);
	}
}

var gameloop = function(time) {
	window.requestAnimationFrame(gameloop);
	var canvas = document.getElementById("canvas");
	var ctx = canvas.getContext("2d");

	if (g.state == 'title') {
		ctx.drawImage(g.title, 0, 0);
		return;
	}

	if (g.blob_mode == 'flee') {
		g.blob_timer--;
		if (g.blob_timer <= 0) {
			g.blob_mode = 'attack';
		}
	}

	if (g.state == 'play') {
		g.health_timer++;
		if (g.health_timer > g.health_timer_trigger) {
			update_health(-g.health_decay);
			g.health_timer = 0;
			if (g.health <= 0) {
				g.state = 'gameover_lose';
			}
		}

		update_player_location(g.dx, g.dy);
	}
	if (g.state != 'gameover_win') {
		update_blobs();
	}

	ctx.clearRect(0, 0, g.width, g.height);

	ctx.drawImage(g.background, 0, 0);
	ctx.drawImage(g.light[Math.round(g.health)], 0, 0);

	map_draw(ctx, g.map, 0, 0);

	draw_crystals(ctx);
	draw_blobs(ctx);
	draw_objects(ctx);

	var image = ctx.getImageData(0, 0, g.width, g.height);
	draw_shadows(image);
	draw_player(ctx, image);
	ctx.putImageData(image, 0, 0);

	if (g.state == 'gameover_lose') {
		ctx.drawImage(g.lose, 0, 0);
	}
	if (g.state == 'gameover_win') {
		ctx.drawImage(g.win, 0, 0);
	}
}

var update_health = function(d) {
	g.health += d;
	if (g.health < 0)
		g.health = 0;
	if (g.health > 16)
		g.health = 16;
}

var update_player_location = function(dx, dy) {
	if (dx == 0 && dy == 0) {
		return true;
	}

	var oldx = g.player_x;
	var oldy = g.player_y;

	if (dx != 0) {
		g.player_x += dx;
		if (g.player_x < 32)
			g.player_x = 32;
		if (g.player_x > (g.map_width - 32))
			g.player_x = g.map_width - 32;
	}
	if (dy != 0) {
		g.player_y += dy;
		if (g.player_y < 32)
			g.player_y = 32;
		if (g.player_y > (g.map_width - 32))
			g.player_y = g.map_width - 32;
	}

	if (g.player_x != oldx || g.player_y != oldy) {
		// Check for collisions with map objects (trees).
		var moffset1 = calc_map_offset(31, 31);
		var moffset2 = calc_map_offset(31, 32);
		var map = g.map_data.data;
		var threshold = 240;
		if (map[moffset1+3] > threshold || map[moffset1+7] > threshold
				|| map[moffset2+3] > threshold || map[moffset2+7] > threshold) {
			g.player_x = oldx;
			g.player_y = oldy;
			// If only moving H or V, then cancel move.
			if (dx == 0 || dy == 0) {
				return false;
			}
			// If moving diagonally, then try H and V directions individually.
			if (!update_player_location(dx, 0)) {
				if (!update_player_location(0, dy)) {
					return false;
				}
			}
		}
		// Check collisions with crystals.
		for (var i = 0; i < g.crystals.length; i++) {
			var info = g.crystals[i];
			var not_found = info[1];
			if (not_found) {
				var pos = info[0];
				if (is_near_player_square(pos[0], pos[1], 2)) {
					info[1] = false;
					update_health(16);
					g.blob_mode = 'flee';
					g.blob_timer = 500;
				}
			}
		}
		// Check collisions with objects.
		for (var i = 0; i < g.objects.length; i++) {
			// [name, image, filename, x, y]
			var info = g.objects[i];
			if (is_near_player_square(info[3], info[4], 3)) {
				g.state = 'gameover_win';
			}
		}
	}
	return true;
}

var update_blobs = function() {
	// Check collisions with player/blobs.
	for (var i = 0; i < g.blobs.length; i++) {
		// 0: [x, y] - starting x,y position
		// 1: [x, y] - current x,y position (when active)
		// 2: active?
		var info = g.blobs[i];
		var active = info[2];
		if (active) {
			var pos = info[1];
			if (is_near_player_square(pos[0], pos[1], 3)) {
				update_health(-0.05);
			}
		}
	}

	var active_blobs = [];
	for (var i = 0; i < g.blobs.length; i++) {
		var info = g.blobs[i];
		if (info[2]) {
			active_blobs.push([info[1][0], info[1][1]]);
		}
	}
	for (var i = 0; i < g.blobs.length; i++) {
		// 0: [x, y] - starting x,y position
		// 1: [x, y] - current x,y position (when active)
		// 2: active?
		// 3: [dx, dy] - dir vector
		var info = g.blobs[i];
		var pos = info[1];
		if (is_near_player_circle(pos[0], pos[1], g.health*2)) {
			info[2] = true;
		}
		if (!is_near_player_circle(pos[0], pos[1], 120)) {
			info[2] = false;
			// Reset monster to starting position.
			info[1][0] = info[0][0];
			info[1][1] = info[0][1];
		}
		var active = info[2];
		if (active) {
			// Move toward player.
			var v_player = vector_toward(pos[0], pos[1], g.player_x, g.player_y);
			var speed = 0.10;
			var dir = (g.blob_mode == 'flee') ? -1.5 : 1;
			pos[0] += (v_player[0] * speed * dir);
			pos[1] += (v_player[1] * speed * dir);

			// Move away from other blobs that are too close.
			var v_away = [0, 0];
			for (var j = 0; j < active_blobs.length; j++) {
				var pos2 = active_blobs[j];
				if (is_near_circle(pos[0], pos[1], pos2[0], pos2[1], 10)) {
					var v = vector_toward(pos[0], pos[1], pos2[0], pos2[1]);
					v_away[0] -= v[0];
					v_away[1] -= v[1];
				}
			}
			var avoid_speed = 0.1;
			pos[0] += (v_away[0] * avoid_speed);
			pos[1] += (v_away[1] * avoid_speed);
		}
	}
}

var draw_crystals = function(ctx) {
	//ctx.save();
	for (var i = 0; i < g.crystals.length; i++) {
		var info = g.crystals[i];
		var not_found = info[1];
		if (not_found) {
			// [x, y] - position
			var pos = info[0];
			// [anim_val_start, anim_val_end, anim_val_upd, anim_val_curr]
			var anim_val = info[2];
			// [anim_time, anim_time_counter]
			var anim_time = info[3];

			ctx.globalAlpha = anim_val[3];
			map_draw(ctx, g.crystal, pos[0]-32, pos[1]-32);

			// Update anim counters.
			anim_time[1]++;
			if (anim_time[1] > anim_time[0]) {
				anim_time[1] = 0;	// Reset anim counter
				anim_val[3] += anim_val[2];	// Update anim value
				if ((anim_val[2] > 0 && anim_val[3] > anim_val[1])
						|| (anim_val[2] < 0 && anim_val[3] < anim_val[1])) {
					anim_val[3] = anim_val[1];	// Reset anim frame
					// Change anim direction.
					var t = anim_val[1];
					anim_val[1] = anim_val[0];
					anim_val[0] = t;
					anim_val[2] = -anim_val[2];
				}
			}
		}
	}
	//ctx.restore();
	ctx.globalAlpha = 1.0;
}

var draw_objects = function(ctx) {
	for (var i = 0; i < g.objects.length; i++) {
		// [name, image, filename, x, y]
		var info = g.objects[i];
		map_draw(ctx, info[1], info[3]-4, info[4]-4);
	}
}

var draw_blobs = function(ctx) {
	for (var i = 0; i < g.blobs.length; i++) {
		var info = g.blobs[i];
		var pos = info[1];
		map_draw(ctx, g.blob, pos[0]-4, pos[1]-4);
	}
}

var draw_player = function(ctx, image) {
	var view = image.data;
	var halo = 220;
	var pos_array = [[31,30], [32,30], [31,33], [32,33], [30,31], [30,32], [33,31], [33,32]];
	for (var i = 0; i < 8; i++) {
		var pos = pos_array[i];
		var voffset = calc_view_offset(pos[0], pos[1]);
		var ahalo = halo * g.player_val[i];
		view[voffset] = ahalo;
		view[voffset+1] = ahalo;
		view[voffset+2] = ahalo;
	}
	g.player_anim_time++;
	if (g.player_anim_time > g.player_anim_time_max) {
		g.player_anim_time = 0;
		for (var i = 0; i < 8; i++) {
			g.player_val[i] = 0.5 + (Math.random()*0.5);
		}
	}
}

var draw_shadows = function(image) {
	var view = image.data;
	var map = g.map_data.data;

	// Shade angle table for each of the 8 sections.
	// Initially, no angles are blocked.
	var shade = new Array(8);
	for (var i = 0; i < 8; i++) {
		var len = 46;
		shade[i] = new Array(len);
	    for (var j = 0; j < len; j++) {
	        shade[i][j] = 0;
	    }
	}

	for (var i = 0; i < g.shadow.length; i++) {
		var info = g.shadow[i];

		check_shadow(map, view, shade[0], 32 + info[0], 31 - info[1], info[2], info[3]);
		check_shadow(map, view, shade[1], 32 + info[1], 31 - info[0], info[2], info[3]);
		check_shadow(map, view, shade[2], 32 + info[1], 32 + info[0], info[2], info[3]);
		check_shadow(map, view, shade[3], 32 + info[0], 32 + info[1], info[2], info[3]);
		check_shadow(map, view, shade[4], 31 - info[0], 32 + info[1], info[2], info[3]);
		check_shadow(map, view, shade[5], 31 - info[1], 32 + info[0], info[2], info[3]);
		check_shadow(map, view, shade[6], 31 - info[1], 31 - info[0], info[2], info[3]);
		check_shadow(map, view, shade[7], 31 - info[0], 31 - info[1], info[2], info[3]);
	}
}

var check_shadow = function(map, view, shade, x, y, min, max) {
	// Is this spot already shaded?
	// It is shaded if more than 1/2 of the angle it covers is already
	// shaded by another pixel.
	var shaded = false;
	var shade_count = 0;
	for (var m = min; m <= max; m++)
		shade_count += shade[m];
	if (shade_count >= (max - min + 1)/2) {
		shaded = true;
		//console.log('shaded: ' + shade_count);
	}

	// Check alpha channel of map to find trees (alpha = 255).
	// Each pixel is RGBA, so alpha is moffset+3.
	var moffset = calc_map_offset(x, y);
	var malpha = map[moffset+3];
	if (malpha == 255) {
		// Shade the area behind this spot.
		for (var m = min; m <= max; m++) {
			shade[m] = 1;
		}
		//console.log('shading ' + min + ' to ' + max);
	}

	if (shaded) {
		var voffset = calc_view_offset(x, y);
		if (view[voffset+0] > g.shadow_threshold) {
			view[voffset+0] = g.shadow_threshold;
			view[voffset+1] = g.shadow_threshold;
			view[voffset+2] = g.shadow_threshold;
		}
	}
}

// Draw the image into the map canvas at x,y.
var map_draw = function(ctx, img, x, y) {
	ctx.drawImage(img, -Math.round(g.player_x)+32+x, -Math.round(g.player_y)+32+y);
}

// Is x,y near the player (within a 2d-pixel square centered at player)?
var is_near_player_square = function(x, y, d) {
	return (x < g.player_x+d && x > g.player_x-d && y < g.player_y+d && y > g.player_y-d);
}

// Is x,y near the player (within a d radius circle centered at player)?
var is_near_player_circle = function(x, y, d) {
	var dx = g.player_x - x;
	var dy = g.player_y - y;
	return (dx * dx + dy * dy) < (d * d);
}

// Is x1,y1 near the x2,y2 (within a distance d)?
var is_near_circle = function(x1, y1, x2, y2, d) {
	var dx = x2 - x1;
	var dy = y2 - y1;
	return (dx * dx + dy * dy) < (d * d);
}

// Return vector pointing from x0,y0 to x1,y1.
var vector_toward = function(x0, y0, x1, y1) {
	// Move toward player.
	var dx = x1 - x0;
	var dy = y1 - y0;
	var len = Math.sqrt(dx * dx + dy * dy);
	dx /= len;
	dy /= len;
	return [dx, dy];
}

// Convert (x,y) in viewport into index in map image.
var calc_map_offset = function(x, y) {
	var x2 = x + Math.round(g.player_x) - 32;
	var y2 = y + Math.round(g.player_y) - 32;
	return ((y2 * g.map_data.width) + x2) * 4;
}

// Convert (x,y) in viewport into index in viewport image.
var calc_view_offset = function(x, y) {
	return ((y * g.width) + x) * 4;
}

init();
