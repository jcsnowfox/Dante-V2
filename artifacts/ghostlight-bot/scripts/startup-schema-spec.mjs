export const journalSchema = {
  tables: {
    journal_entries: {
      columns: ["id","entry_id","user_scope","automation_id","channel_id","guild_id","title","content","created_at"],
      indexes: ["journal_entries_user_scope_created_at_idx","journal_entries_automation_created_at_idx"],
    },
  },
};

export const startupSchema = {
  app_settings: { columns: ["setting_key","setting_value","updated_at"], indexes: [] },
  conversation_events: { columns: ["id","event_id","conversation_id","user_scope","channel_id","guild_id","author_id","author_name","role","content","metadata","created_at"], indexes: ["conversation_events_conversation_created_at_idx","conversation_events_user_scope_created_at_idx"] },
  memories: { columns: ["id","memory_id","user_scope","memory_type","domain","sensitivity","content","summary","metadata","source","source_ref","confidence","created_at","updated_at","last_accessed_at","access_count"], indexes: [] },
  memory_usage_events: { columns: ["id","event_id","memory_id","user_scope","conversation_id","source_surface","metadata","created_at"], indexes: [] },
  staged_memories: { columns: ["id","staged_memory_id","source_kind","source_ref","grouping_key","dedupe_key","title","content","memory_type","domain","sensitivity","status","review_flags","source_payload","promoted_memory_id","user_scope","reference_date","created_at","updated_at","reviewed_at"], indexes: ["staged_memories_source_dedupe_idx","staged_memories_status_idx","staged_memories_user_scope_idx","staged_memories_reference_date_idx"] },
  generated_images: { columns: ["id","image_id","user_scope","source_surface","display_name","conversation_id","channel_id","discord_message_id","source_message_id","prompt","revised_prompt","model","size","quality","style","output_format","mime_type","file_size_bytes","storage_key","thumbnail_storage_key","custom_tags","is_favorite","status","error_message","created_at","deleted_at"], indexes: ["generated_images_user_scope_created_at_idx","generated_images_conversation_created_at_idx","generated_images_status_created_at_idx","generated_images_custom_tags_gin_idx"] },
  generated_audio: { columns: ["id","audio_id","user_scope","source_surface","display_name","conversation_id","channel_id","discord_message_id","source_message_id","prompt","spoken_text","caption","voice_id","model","output_format","mime_type","file_size_bytes","storage_key","custom_tags","is_favorite","status","error_message","created_at","deleted_at"], indexes: ["generated_audio_user_scope_created_at_idx","generated_audio_conversation_created_at_idx","generated_audio_status_created_at_idx","generated_audio_custom_tags_gin_idx"] },
  music_spotify_connections: { columns: ["id","user_scope","spotify_user_id","display_name","access_token","refresh_token","token_expires_at","created_at","updated_at"], indexes: [] },
  music_tracks: { columns: ["id","track_id","user_scope","provider","provider_track_id","title","artist","album","duration_ms","metadata","created_at","updated_at"], indexes: [] },
  music_track_affinities: { columns: ["id","user_scope","track_id","affinity","source","created_at","updated_at"], indexes: [] },
  music_playlists: { columns: ["id","playlist_id","user_scope","provider","provider_playlist_id","name","description","metadata","created_at","updated_at"], indexes: [] },
  music_playlist_tracks: { columns: ["id","playlist_id","track_id","position","created_at","updated_at"], indexes: [] },
  image_style_presets: { columns: ["id","preset_id","user_scope","name","description","prompt","negative_prompt","settings","is_default","created_at","updated_at"], indexes: [] },
  image_appearance_presets: { columns: ["id","preset_id","user_scope","name","description","prompt","negative_prompt","settings","is_default","created_at","updated_at"], indexes: [] },
  cache: { columns: ["cache_key","user_scope","cache_value","expires_at","created_at","updated_at"], indexes: ["cache_user_scope_updated_at_idx","cache_expires_at_idx"] },
  summary_queue: { columns: ["id","queue_id","user_scope","queue_type","summary_date","title","content","status","source_payload","weekly_memory_id","consumed_at","expires_at","created_at","updated_at"], indexes: ["summary_queue_lookup_idx","summary_queue_status_idx","summary_queue_expires_at_idx"] },
  ...journalSchema.tables,
  automations: { columns: ["id","automation_id","user_scope","name","description","type","enabled","schedule_mode","schedule_day","schedule_time","timezone","prompt","channel_id","mention_user","enabled_tools","thread_title_template","thread_starter_prompt","thread_mode_key","created_at","updated_at"], indexes: ["automations_user_scope_idx","automations_enabled_idx","automations_type_idx"] },
  heartbeat_actions: { columns: ["id","action_id","user_scope","label","description","enabled","is_builtin","executor_type","prompt","target_channel_id","mention_user","created_at","updated_at"], indexes: ["heartbeat_actions_user_scope_idx","heartbeat_actions_enabled_idx","heartbeat_actions_builtin_idx"] },
  proactive_actions: { columns: ["id","action_id","user_scope","label","description","enabled","trigger_type","schedule_mode","schedule_day","schedule_time","timezone","prompt","channel_id","mention_user","thread_title_template","thread_starter_prompt","thread_mode_key","created_at","updated_at"], indexes: ["proactive_actions_user_scope_idx","proactive_actions_trigger_type_idx","proactive_actions_schedule_idx"] },
  channel_mode_definitions: { columns: ["mode_key","label","description","instructions","memory_types","memory_sensitivity","include_time_context","retrieval_source","retrieval_access","heartbeat_role","created_at","updated_at"], indexes: [] },
  channel_mode_assignments: { columns: ["channel_id","mode_key","created_at","updated_at"], indexes: ["channel_mode_assignments_mode_key_idx"] },
  second_life_bridge_settings: { columns: ["id","companion_id","enabled","agent_name","agent_uuid","owner_avatar_uuid","shared_secret_hash","home_region","home_coordinates_json","wander_radius_meters","local_chat_enabled","stranger_replies_enabled","autonomy_enabled","discovery_enabled","initiative_enabled","outfits_enabled","landmarks_enabled","object_interaction_enabled","furniture_interaction_enabled","dance_pad_interaction_enabled","quiet_hours_start","quiet_hours_end","max_local_replies_per_10_min","max_stranger_replies_per_30_min","privacy_guard_enabled","autonomy_paused","created_at","updated_at"], indexes: [] },
  game_sessions: { columns: ["id","session_id","guild_id","channel_id","game_name","status","players","state","created_at","updated_at"], indexes: ["game_sessions_guild_channel_idx","game_sessions_status_idx","game_sessions_updated_at_idx"] },
};
