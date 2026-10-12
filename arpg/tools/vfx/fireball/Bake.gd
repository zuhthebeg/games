extends Node3D
# Native Forward+ transparent capture, no Lab floor/dummies/UI/background subtraction.
# Run from the initialized/imported generated Lab project, using Bake.tscn.
var camera: Camera3D
var output: String

func _ready() -> void:
	output = OS.get_environment("FX1_FRAMES")
	if output.is_empty():
		push_error("FX1_FRAMES required")
		get_tree().quit(2)
		return
	DirAccess.make_dir_recursive_absolute(output)
	get_viewport().transparent_bg = true
	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 9.0
	add_child(camera)
	camera.current = true
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.background_mode = Environment.BG_CLEAR_COLOR
	env.environment.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env.environment.glow_enabled = false
	add_child(env)
	await get_tree().process_frame
	await bake("projectile", "VFX_Projectile_Fire", 36)
	await bake("impact", "VFX_Fire_Explosion", 54)
	get_tree().quit()

func bake(label: String, id: String, frames: int) -> void:
	Vfx.stop_all()
	await get_tree().process_frame
	seed(1729)
	var handle = Vfx.play(id, Vector3.ZERO)
	if handle == null:
		get_tree().quit(3)
		return
	for frame in range(frames):
		# Sustain the projectile beyond one short game's typical flight; move the
		# emitter and follow its head so inherited world-space trails are baked.
		var x := float(frame) * 0.12 if label == "projectile" else 0.0
		if is_instance_valid(handle): handle.position.x = x
		var target := Vector3(x, 0.6, 0)
		camera.position = target + Vector3(0, 8, 10)
		camera.look_at(target)
		await RenderingServer.frame_post_draw
		if frame % 3 == 0:
			var image := get_viewport().get_texture().get_image()
			var path := output.path_join("%s-%03d.png" % [label, frame])
			var err := image.save_png(path)
			print(JSON.stringify({"capture":path,"frame":frame,"error":err,"size":[image.get_width(),image.get_height()],"alpha":image.detect_alpha()}))
			if err != OK:
				get_tree().quit(4)
				return
		await get_tree().process_frame
	Vfx.stop_all()
	await get_tree().process_frame
