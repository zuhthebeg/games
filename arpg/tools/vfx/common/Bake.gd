extends Node3D
# Native transparent Effekseer capture. Config is local task input, not remote code.
func _ready() -> void:
	var config = JSON.parse_string(FileAccess.get_file_as_string(OS.get_environment("FX2_CONFIG")))
	var output: String = config.output
	DirAccess.make_dir_recursive_absolute(output)
	get_viewport().transparent_bg = true
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 9.0
	camera.position = Vector3(0, 0, 10)
	add_child(camera)
	camera.look_at(Vector3.ZERO)
	camera.current = true
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.background_mode = Environment.BG_CLEAR_COLOR
	env.environment.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env.environment.glow_enabled = false
	add_child(env)
	await get_tree().process_frame
	for clip in config.clips:
		Vfx.stop_all()
		await get_tree().process_frame
		seed(1729)
		var handle = Vfx.play(clip.id, Vector3.ZERO)
		if handle == null:
			get_tree().quit(3)
			return
		for frame in range(int(clip.ticks)):
			await RenderingServer.frame_post_draw
			if frame % 3 == 0:
				var image := get_viewport().get_texture().get_image()
				var path := output.path_join("%s-%03d.png" % [clip.label, frame])
				var err := image.save_png(path)
				print(JSON.stringify({"capture":path,"frame":frame,"error":err,"size":[image.get_width(),image.get_height()],"alpha":image.detect_alpha()}))
				if err != OK:
					get_tree().quit(4)
					return
			await get_tree().process_frame
	Vfx.stop_all()
	get_tree().quit()
