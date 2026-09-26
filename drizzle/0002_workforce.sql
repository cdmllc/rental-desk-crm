ALTER TABLE `crm_users` ADD COLUMN `crm_access` text NOT NULL DEFAULT 'own';
ALTER TABLE `crm_users` ADD COLUMN `workforce_access` text NOT NULL DEFAULT 'none';
UPDATE `crm_users` SET `crm_access`='admin', `workforce_access`='admin' WHERE `role`='admin';
CREATE TABLE IF NOT EXISTS `workforce_state` (
  `workspace_id` text PRIMARY KEY NOT NULL,
  `data` text NOT NULL,
  `updated_at` integer NOT NULL
);
