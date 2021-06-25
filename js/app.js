const searchWorker = new Worker("./js/json-search-worker.js");

const versions = ["4.1.0-RELEASE", "4.0.0-RELEASE"];
const app = Vue.createApp({
  inject: ["adp", "adpUtils"],
  data: function () {
    return {
      searchWorker: null,
      errors: {},
      searchMessage: null,
      loading: false,
      query: null,
      versions: versions,
      version: versions[0],
      searchInstances: false,
      originalSelected: 0,
      from: 0,
      size: 10,
      total: 0,
      results: []
    };
  },
  computed: {
    hasResult: function () {
      return this.results && this.results.length > 0;
    },
    paginatedResults: function () {
      return this.results ? this.results.slice(this.from, this.from + this.size) : [];
    },
    placeholder: function () {
      return this.searchInstances ? "ClassName:Query" : "Query";
    }
  },
  methods: {
    getOrInitWorker: function () {
      var self = this;
      if (!self.searchWorker) {
        searchWorker.onmessage = function (e) {
          const resultsJson = e.data ? e.data.results : {};
          console.log("Message received from worker");
          self.total = resultsJson.totalCount;
          self.results = resultsJson.components;
          self.loading = false;
        }

        searchWorker.onerror = function (error) {
          self.searchMessage = null;
          self.results = [];
          if (error && error.message) {
            self.errors["global"] = error.message;
          }
          self.loading = false;
        }

        self.searchWorker = searchWorker;
      }
      return self.searchWorker;
    },
    doSearchComponents: function () {
      var self = this;
      self.loading = true;
      self.searchMessage = "Searching components...";

      const searchWorker = self.getOrInitWorker();

      searchWorker.postMessage({ q: self.query, v: self.version, type: "components", jsonFileURL: `../data/interlok-component-${self.version.toLowerCase()}.json` });
    },
    doSearchInstances: function () {
      var self = this;
      self.loading = true;
      self.searchMessage = "Searching components...";

      const searchWorker = self.getOrInitWorker();

      const queryParts = this.adpUtils.trimToEmpty(self.query).split(":");
      const subQuery = queryParts.length > 1 ? queryParts[1] : "";

      const query = {
        $and: [
          { parents: this.adpUtils.addPrefix(queryParts[0], "=") }
        ]
      }

      if (subQuery !== "") {
        query.$and[1] = {
          $or: [
            { fullClassName: subQuery },
            { className: subQuery },
            { packageName: subQuery },
            { alias: subQuery },
            { componentType: subQuery },
            { $path: "profile.tag", $val: subQuery }
          ]
        }
      }

      searchWorker.postMessage({ q: query, v: self.version, type: "instances", jsonFileURL: `../data/interlok-component-${self.version.toLowerCase()}.json` });
    },
    search: function (event) {
      event.preventDefault();
      this.originalSelected = 0;
      this.from = 0;
      if (this.validate(event)) {
        this.doSearch();
      }
    },
    doSearch: function () {
      if (this.searchInstances) {
        this.doSearchInstances();
      } else {
        this.doSearchComponents();
      }
    },
    searchPaginate: function (msg) {
      this.originalSelected = msg.selected;
      this.from = msg.from;
      this.size = msg.size;
      console.log(this.selected, this.from, this.size);
    },
    validate: function (event) {
      this.searchMessage = null;
      this.errors = {};
      if (this.query && this.version) {
        return true;
      }
      if (!this.query) {
        this.errors["query"] = "Query required.";
      }
      if (!this.version) {
        this.errors["version"] = "Version required.";
      }
    },
    getError: function (property) {
      return this.errors[property];
    },
    hasError: function (property) {
      return this.getError(property) != null;
    }
  }
});

// Register adp to the vue app
app.provide("adp", adp);
app.provide("adpUtils", adp.utils);

app.component("search-results", {
  props: {
    total: Number,
    results: Array,
    originalSelected: Number
  },
  data: function () {
    return {
      size: 10
    }
  },
  computed: {
    hasResult: function () {
      return this.results && this.results.length > 0;
    }
  },
  methods: {
    paginate: function (msg) {
      this.$emit('paginate', { selected: msg.selected, from: msg.from, size: msg.size });
    }
  },
  template: `
    <div>
      <div class="text-muted" v-show="hasResult">
        <span v-text="total"></span> Results
      </div>
      <ul class="list-unstyled">
       <search-results-result v-for="result in results" v-bind:result="result" v-bind:key="result.fullClassName"></search-results-result>
      </ul>
      <search-results-pagination v-show="hasResult" v-bind:total="total" v-bind:original-selected="originalSelected" v-bind:size="size" v-on:paginate="paginate"></search-results-pagination>
    </div>
  `
});

app.component("search-results-pagination", {
  props: {
    total: Number,
    size: Number,
    originalSelected: Number
  },
  data: function () {
    return {
      selected: 0,
      limit: 5
    }
  },
  updated: function () {
    if (this.originalSelected !== this.selected) {
      this.selected = 0
    }
  },
  computed: {
    pageCount: function () {
      return Math.ceil(this.total / this.size);
    },
    pages: function () {
      var pages = [];
      for (var i = 0; i < this.pageCount; i++) {
        if (this.selected - this.limit <= i && this.selected + this.limit >= i) {
          var page = {
            index: i,
            content: this.selected - this.limit === i || this.selected + this.limit == i ? '...' : i + 1,
            selected: i === this.selected
          }
          pages.push(page);
        }
      }
      return pages;
    },
    firstPageSelected: function () {
      return this.selected === 0;
    },
    lastPageSelected: function () {
      return this.selected === this.pageCount - 1 || this.pageCount === 0;
    }
  },
  methods: {
    paginate: function () {
      this.$emit('paginate', { selected: this.selected, from: this.selected * this.size, size: this.size });
    },
    setPage: function (page) {
      this.selected = page.index;
      this.paginate();
    },
    firstPage: function () {
      this.selected = 0;
      this.paginate();
    },
    previous: function () {
      this.selected = Math.max(0, this.selected - 1);
      this.paginate();
    },
    next: function () {
      this.selected = this.selected + 1;
      this.paginate();
    },
    lastPage: function () {
      this.selected = this.pageCount - 1;
      this.paginate();
    }
  },
  template: `
    <nav aria-label="...">
      <ul class="pagination">
        <li class="page-item" v-bind:class="[firstPageSelected ? 'disabled' : '']">
          <a class="page-link" href="#" v-on:click="firstPage" v-on:keyup.enter="firstPage" v-bind:tabindex="firstPageSelected ? -1 : 0">First</a>
        </li>
        <li class="page-item" v-bind:class="[firstPageSelected ? 'disabled' : '']">
          <a class="page-link" href="#" v-on:click="previous">Previous</a>
        </li>
        <li class="page-item" v-bind:class="{'active': page.selected}" v-for="page in pages" v-bind:result="page">
          <a class="page-link" href="#" v-on:click="setPage(page)">{{ page.content }}</a>
          <span class="sr-only" v-if="page.selected">(current)</span>
        </li>
        <li class="page-item" v-bind:class="[lastPageSelected ? 'disabled' : '']">
          <a class="page-link" href="#" v-on:click="next">Next</a>
        </li>
        <li class="page-item" v-bind:class="[lastPageSelected ? 'disabled' : '']">
          <a class="page-link" href="#" v-on:click="lastPage" v-on:keyup.enter="lastPage" v-bind:tabindex="lastPageSelected ? -1 : 0">Last</a>
        </li>
      </ul>
    </nav>
  `
});

app.component("search-results-result", {
  inject: ["adpUtils"],
  props: {
    result: Object
  },
  data: function () {
    return {
      showFullDesc: false,
    }
  },
  computed: {
    componentTypeClass: function () {
      return this.result.item.componentType == "object" ? "extension" : this.result.item.componentType;
    },
    iconClass: function () {
      return "fa-" + this.componentTypeClass;
    },
    borderClass: function () {
      return "border-" + this.componentTypeClass;
    },
    title: function () {
      return this.adpUtils.humanyze(this.result.item.alias || this.result.item.className);
    },
    summary: function () {
      return this.result.item.profile && this.result.item.profile.summary ? this.result.item.profile.summary : this.description.substring(0, Math.min(this.description.length, 50));
    },
    description: function () {
      return this.result.item.description || "";
    },
    author: function () {
      return this.result.item.profile && this.result.item.profile.author ? this.result.item.profile.author : "";
    },
    since: function () {
      return this.result.item.profile && this.result.item.profile.since ? this.result.item.profile.since : "";
    },
    tags: function () {
      return this.result.item.profile && this.result.item.profile.tag ? this.result.item.profile.tag.split(",") : [];
    }
  },
  methods: {
    toggleFullDesc: function () {
      this.showFullDesc = !this.showFullDesc;
    }
  },
  template: `
    <li class="mb-2">
      <div class="card" v-bind:class="[borderClass]">
        <div class="card-body">
          <h5 class="card-title">
            <i class="fa" v-bind:class="[iconClass]"></i>&nbsp;{{ title }}
            <small class="text-muted" v-show="since">(Since&nbsp;{{ since }})</small>
          </h5>
          <h6 class="card-subtitle mb-2 text-muted" title="Author">{{ author }}</h6>
          <p class="card-text mb-2">
            <a v-bind:href="result.item.pageUrl" class="card-link" target="_blank">{{ result.item.fullClassName }}</a>
            <span v-show="result.item.alias">
              -
              <code>{{ result.item.alias }}</code>
            </span>
          </p>
          <p class="card-text mb-2">
            <span class="text-muted" v-text="summary"></span>
            <a href="#" v-on:click.prevent="toggleFullDesc" v-text="showFullDesc ? 'Less...' : 'More...'"></a>
          </p>
          <p class="card-text mb-2" v-show="showFullDesc" v-html="adpUtils.purify(result.item.descriptionHtml) || 'No description'"></p>
          <p class="card-text mb-2" v-if="result.item.projectInfo">
            <small class="text-info">{{ result.item.projectInfo["Implementation-Title"] + ' ' + result.item.projectInfo["Implementation-Version"] }}</small>
          </p>
          <p class="card-text" v-if="tags && tags.length > 0">
            <span v-for="tag in tags"><span class="badge bg-info" v-bind:class="['badge-' + tag]">{{ tag }}</span>&nbsp;</span>
          </p>
        </div>
      </div>
    </li>
  `
});

app.mount('#app');
