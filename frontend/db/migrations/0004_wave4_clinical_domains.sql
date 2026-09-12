ALTER TABLE `patient_assignments` ADD `user_id` integer;
--> statement-breakpoint
ALTER TABLE `patient_assignments` ADD `role` text;
--> statement-breakpoint
ALTER TABLE `patient_assignments` ADD `shift_start` integer;
--> statement-breakpoint
ALTER TABLE `patient_assignments` ADD `shift_end` integer;
--> statement-breakpoint
ALTER TABLE `patient_assignments` ADD `status` text DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE `patient_assignments` ADD `created_by` integer;
--> statement-breakpoint
ALTER TABLE `vitals` ADD `acknowledged_at` integer;
--> statement-breakpoint
ALTER TABLE `vitals` ADD `acknowledged_by` integer;
--> statement-breakpoint
ALTER TABLE `care_plan_items` ADD `created_by` integer;
--> statement-breakpoint
ALTER TABLE `care_plan_items` ADD `assigned_to` integer;