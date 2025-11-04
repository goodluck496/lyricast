import { relations } from "drizzle-orm/relations";
import { presentations, slides } from "./schema";

export const slidesRelations = relations(slides, ({one}) => ({
	presentation: one(presentations, {
		fields: [slides.presentationId],
		references: [presentations.id]
	}),
}));

export const presentationsRelations = relations(presentations, ({many}) => ({
	slides: many(slides),
}));