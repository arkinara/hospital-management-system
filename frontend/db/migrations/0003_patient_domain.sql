ALTER TABLE `patients` RENAME COLUMN `status` TO `admission_status`;
--> statement-breakpoint
ALTER TABLE `patients` ADD `email` text;
--> statement-breakpoint
ALTER TABLE `patients` ADD `blood_type` text;
--> statement-breakpoint
ALTER TABLE `patients` ADD `is_active` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `patients` ADD `updated_at` integer;
--> statement-breakpoint
ALTER TABLE `patient_allergies` RENAME COLUMN `substance` TO `allergen`;
--> statement-breakpoint
ALTER TABLE `patient_allergies` ADD `reaction` text;
--> statement-breakpoint
ALTER TABLE `patient_dedup_flags` ADD `similarity` integer;
--> statement-breakpoint
ALTER TABLE `patient_dedup_flags` ADD `override_reason` text;
--> statement-breakpoint
CREATE TABLE `patient_departments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` integer NOT NULL,
	`department_id` integer NOT NULL,
	`since_date` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_departments_patient_department_unique` ON `patient_departments` (`patient_id`,`department_id`);
