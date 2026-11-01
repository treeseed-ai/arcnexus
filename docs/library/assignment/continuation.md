# Durable assignment activations

General execution (#78) advances one workflow stage per scheduler activation.
The saved next stage, thread, plan, frozen regression, attempt history and pending
requests survive process reopening. Yielding a dependency does not advance the
stage or reset evidence. The requesting stage continues after verified delivery.
Host checks finish before a stage checkpoint is declared safe for pause.

A retained activation must match captured authority and candidate identity before
continuing. Model claims never bypass specification or final verification. Existing
standalone workflows continue to use the same stage implementations.
