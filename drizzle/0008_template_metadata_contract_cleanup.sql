-- Contract marker only. Deprecated metadata columns remain physically intact
-- so existing workspaces and backups can be read and rolled back safely.
INSERT OR IGNORE INTO app_state (key, value)
VALUES ('template_metadata_contract_version', 'core-fields-v1');
