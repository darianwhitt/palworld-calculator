"""
Tkinter GUI for the Palworld crafting calculator.

Usage: python app.py
"""
import tkinter as tk
from tkinter import ttk, messagebox

from calculator import expand, load_items


class CraftingCalculatorApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Palworld Crafting Calculator")
        self.geometry("800x600")

        try:
            self.items = load_items()
        except FileNotFoundError:
            messagebox.showerror(
                "Missing data",
                "data/items.json not found. Run scraper.py first to generate it.",
            )
            self.items = {}

        self.all_names = sorted(self.items.keys())
        self.selected_item = tk.StringVar()

        self._build_layout()

    def _build_layout(self):
        top = ttk.Frame(self, padding=10)
        top.pack(fill="x")

        ttk.Label(top, text="Item:").grid(row=0, column=0, sticky="w")
        self.search_entry = ttk.Entry(top, width=40)
        self.search_entry.grid(row=0, column=1, sticky="w", padx=5)
        self.search_entry.bind("<KeyRelease>", self._on_search)

        self.suggestions = tk.Listbox(top, width=40, height=6)
        self.suggestions.grid(row=1, column=1, sticky="w", padx=5)
        self.suggestions.bind("<<ListboxSelect>>", self._on_suggestion_pick)

        ttk.Label(top, text="Quantity:").grid(row=0, column=2, sticky="w", padx=(20, 0))
        self.qty_spinbox = ttk.Spinbox(top, from_=1, to=999999, width=8)
        self.qty_spinbox.set(1)
        self.qty_spinbox.grid(row=0, column=3, sticky="w", padx=5)

        self.calc_button = ttk.Button(top, text="Calculate", command=self._on_calculate)
        self.calc_button.grid(row=0, column=4, padx=(20, 0))

        # Breakdown tree
        tree_frame = ttk.LabelFrame(self, text="Crafting breakdown", padding=5)
        tree_frame.pack(fill="both", expand=True, padx=10, pady=(0, 5))

        self.tree = ttk.Treeview(tree_frame, columns=("qty",), show="tree headings")
        self.tree.heading("#0", text="Item")
        self.tree.heading("qty", text="Quantity")
        self.tree.column("qty", width=100, anchor="e")
        self.tree.pack(fill="both", expand=True, side="left")

        tree_scroll = ttk.Scrollbar(tree_frame, orient="vertical", command=self.tree.yview)
        tree_scroll.pack(side="right", fill="y")
        self.tree.configure(yscrollcommand=tree_scroll.set)

        # Raw totals summary
        summary_frame = ttk.LabelFrame(self, text="Total raw resources needed", padding=5)
        summary_frame.pack(fill="both", expand=False, padx=10, pady=(0, 10))

        self.summary_tree = ttk.Treeview(
            summary_frame, columns=("qty",), show="tree headings", height=8
        )
        self.summary_tree.heading("#0", text="Resource")
        self.summary_tree.heading("qty", text="Total quantity")
        self.summary_tree.column("qty", width=100, anchor="e")
        self.summary_tree.pack(fill="both", expand=True)

    def _on_search(self, _event):
        query = self.search_entry.get().strip().lower()
        self.suggestions.delete(0, tk.END)
        if not query:
            return
        matches = [name for name in self.all_names if query in name.lower()][:50]
        for name in matches:
            self.suggestions.insert(tk.END, name)

    def _on_suggestion_pick(self, _event):
        selection = self.suggestions.curselection()
        if not selection:
            return
        name = self.suggestions.get(selection[0])
        self.search_entry.delete(0, tk.END)
        self.search_entry.insert(0, name)
        self.selected_item.set(name)

    def _on_calculate(self):
        item_name = self.search_entry.get().strip()
        if item_name not in self.items:
            messagebox.showwarning("Unknown item", f'"{item_name}" was not found in the data.')
            return

        try:
            quantity = int(self.qty_spinbox.get())
            if quantity < 1:
                raise ValueError
        except ValueError:
            messagebox.showwarning("Invalid quantity", "Quantity must be a positive integer.")
            return

        root_node, raw_totals = expand(self.items, item_name, quantity)

        self.tree.delete(*self.tree.get_children())
        self._populate_tree("", root_node)

        self.summary_tree.delete(*self.summary_tree.get_children())
        for name, total in sorted(raw_totals.items(), key=lambda kv: kv[0]):
            self.summary_tree.insert("", tk.END, text=name, values=(total,))

    def _populate_tree(self, parent_id, node):
        label = f"{node.name}" + (" (raw)" if node.is_leaf else "")
        node_id = self.tree.insert(parent_id, tk.END, text=label, values=(node.qty,), open=True)
        for child in node.children:
            self._populate_tree(node_id, child)


if __name__ == "__main__":
    app = CraftingCalculatorApp()
    app.mainloop()
