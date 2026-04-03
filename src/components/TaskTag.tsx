const tagStyles = {
  Work: "bg-tag-work text-tag-work-text",
  Personal: "bg-tag-personal text-tag-personal-text",
  Household: "bg-tag-household text-tag-household-text",
};

const TaskTag = ({ tag }: { tag: "Work" | "Personal" | "Household" }) => (
  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-md ${tagStyles[tag]}`}>
    {tag}
  </span>
);

export default TaskTag;
