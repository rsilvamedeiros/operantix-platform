mock_provider "aws" {}

variables {
  repositories = ["operantix/platform-api", "operantix/workflow-worker"]
}

run "one_repository_per_image" {
  command = apply

  assert {
    condition     = length(aws_ecr_repository.this) == 2
    error_message = "Expected one repository per image name."
  }
}

run "tags_cannot_be_overwritten" {
  command = apply

  assert {
    condition     = alltrue([for r in aws_ecr_repository.this : r.image_tag_mutability == "IMMUTABLE"])
    error_message = "A released tag must always point at the same image."
  }
}

run "images_are_scanned_on_push" {
  command = apply

  assert {
    condition     = alltrue([for r in aws_ecr_repository.this : r.image_scanning_configuration[0].scan_on_push == true])
    error_message = "Scan on push must be on."
  }
}

run "images_are_encrypted" {
  command = apply

  assert {
    condition     = alltrue([for r in aws_ecr_repository.this : r.encryption_configuration[0].encryption_type == "AES256"])
    error_message = "Images must be encrypted at rest."
  }
}

run "old_images_are_cleaned_up" {
  command = apply

  assert {
    condition     = length(aws_ecr_lifecycle_policy.this) == 2
    error_message = "Every repository needs a lifecycle policy."
  }

  assert {
    condition     = length(jsondecode(aws_ecr_lifecycle_policy.this["operantix/platform-api"].policy).rules) == 2
    error_message = "Expect one rule for untagged and one for tagged images."
  }
}

run "repositories_are_protected_from_deletion_by_default" {
  command = apply

  assert {
    condition     = alltrue([for r in aws_ecr_repository.this : r.force_delete == false])
    error_message = "A repository holding images must not be deleted by accident."
  }
}
